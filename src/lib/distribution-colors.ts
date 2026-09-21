// Scale colors are tied to the score, not its position in a filtered array.
const SCALE_COLORS: Record<string, string> = {
  "1": "#dc4c4c", "2": "#e58b3d", "3": "#d5ad36", "4": "#7aa85a", "5": "#27824b",
};
const CHOICE_COLORS = ["#315581", "#8270a6", "#41878b", "#b58550", "#778497"];

export function distributionColor(questionType: string, label: string, index: number) {
  return questionType === "SCALE_1_5"
    ? SCALE_COLORS[label] ?? "#778497"
    : CHOICE_COLORS[index % CHOICE_COLORS.length];
}
