import { Chart } from 'chart.js/auto';

export function bootstrapChartDefaults() {
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.font.family = "'Plus Jakarta Sans', -apple-system, sans-serif";
  Chart.defaults.color = css.getPropertyValue('--text-2').trim() || '#6b7280';
}
