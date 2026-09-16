export type CreateTemplateState = {
  status: "idle" | "error" | "success";
  message: string;
  templateId?: string;
};
