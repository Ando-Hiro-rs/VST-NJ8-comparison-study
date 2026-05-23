library(tidyverse)
library(psych)

celp_trials <- read_csv('data/NeoCELP-VST_P001_combined_20250523_celp_trials.csv')
vst_trials <- read_csv('data/NeoCELP-VST_P001_combined_20250523_vst_trials.csv')
summary_data <- read_csv('data/NeoCELP-VST_P001_combined_20250523_summary.csv')

cat('=== 基本記述統計 ===\n')
celp_valid <- celp_trials %>% filter(exclude_reason == '')
celp_valid %>%
  group_by(condition) %>%
  summarise(
    n = n(),
    mean_rt = mean(rt_ms),
    sd_rt = sd(rt_ms),
    cv = sd(rt_ms) / mean(rt_ms) * 100
  ) %>%
  print()

cat('\n=== プライミング効果の検定 ===\n')
t_test_result <- t.test(
  rt_ms ~ condition,
  data = celp_valid,
  paired = FALSE,
  alternative = 'two.sided'
)
print(t_test_result)

cohens_d <- function(x, y) {
  pooled_sd <- sqrt((var(x) + var(y)) / 2)
  (mean(y) - mean(x)) / pooled_sd
}
syn_rt <- celp_valid %>% filter(condition == 'synonym') %>% pull(rt_ms)
nsyn_rt <- celp_valid %>% filter(condition == 'nonsynonym') %>% pull(rt_ms)
d <- cohens_d(syn_rt, nsyn_rt)
cat(sprintf("Cohen's d = %.3f\n", d))

cat('\n=== VST レベル別正答率 ===\n')
vst_trials %>%
  group_by(level) %>%
  summarise(
    n = n(),
    correct = sum(is_correct),
    accuracy = mean(is_correct) * 100
  ) %>%
  print()

cat('\n=== VST 整合性チェック ===\n')
vst_check <- vst_trials %>%
  mutate(
    word_at_position = case_when(
      response_position == 0 ~ option_pos_0,
      response_position == 1 ~ option_pos_1,
      response_position == 2 ~ option_pos_2,
      response_position == 3 ~ option_pos_3
    ),
    position_word_match = word_at_position == response_word,
    correctness_match = (response_word == correct_word) == (is_correct == 1)
  )

n_inconsistent <- sum(!vst_check$position_word_match | !vst_check$correctness_match)
cat(sprintf('矛盾レコード数: %d / %d\n', n_inconsistent, nrow(vst_check)))
if (n_inconsistent == 0) {
  cat('✓ 全データが整合性を保っています\n')
}

cat('\n=== 信頼性指標 (内的一貫性) ===\n')
celp_split <- celp_valid %>%
  mutate(half = ifelse(trial_num %% 2 == 0, 'odd', 'even')) %>%
  group_by(half, participant_id) %>%
  summarise(mean_rt = mean(rt_ms), .groups = 'drop') %>%
  pivot_wider(names_from = half, values_from = mean_rt)

if (nrow(celp_split) >= 3) {
  split_r <- cor(celp_split$odd, celp_split$even, use = 'complete.obs')
  spearman_brown <- (2 * split_r) / (1 + split_r)
  cat(sprintf('Split-half相関: r = %.3f\n', split_r))
  cat(sprintf('Spearman-Brown補正後: r = %.3f\n', spearman_brown))
} else {
  cat('参加者数が少なすぎます (3名以上必要)\n')
}

dir.create('output', showWarnings = FALSE)

p1 <- ggplot(celp_valid, aes(x = condition, y = rt_ms, fill = condition)) +
  geom_boxplot(alpha = 0.7) +
  geom_jitter(width = 0.15, alpha = 0.3, size = 1) +
  labs(title = 'NeoCELP: 条件別反応時間分布',
       x = '条件', y = '反応時間 (ms)') +
  theme_minimal()
ggsave('output/celp_rt_distribution.png', p1, width = 6, height = 4, dpi = 150)

p2 <- vst_trials %>%
  group_by(level) %>%
  summarise(accuracy = mean(is_correct) * 100, .groups = 'drop') %>%
  ggplot(aes(x = factor(level), y = accuracy)) +
  geom_col(fill = '#378ADD', alpha = 0.8) +
  geom_text(aes(label = sprintf('%.0f%%', accuracy)), vjust = -0.5, size = 3.5) +
  labs(title = 'NeoVST-NJ8: レベル別正答率',
       x = 'JACET 8000 レベル', y = '正答率 (%)') +
  ylim(0, 105) +
  theme_minimal()
ggsave('output/vst_level_accuracy.png', p2, width = 6, height = 4, dpi = 150)

cat('\n=== 分析完了 ===\n')
cat('図表は output/ に保存されました\n')
