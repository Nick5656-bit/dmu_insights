import { redirect } from "next/navigation";

export default async function ClubSurveyDemoPage() {
  redirect("/club/surveys/latest");
}
