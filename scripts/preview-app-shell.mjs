// Local visual fixture using the real shell and CSS. No login, database or emails.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// --dashboard renders the actual filter JSX with synthetic options only.
let dashboardFixture = "";
if (process.argv.includes("--dashboard")) {
  const panels = await Promise.all(["dmu", "club"].map(async area => {
    const source = await readFile(`src/app/${area}/dashboard/page.tsx`, "utf8");
    const start = source.indexOf('<section className="overflow-visible');
    const end = source.indexOf("</section>", start) + "</section>".length;
    if (start < 0 || end < start) throw new Error("Filter panel missing");
    return source.slice(start, end);
  }));
  dashboardFixture = `
    import Link from "next/link";
    import { ClubMultiSelectFilter } from "./src/components/club-multi-select-filter";
    import { ResultOverviewChart } from "./src/components/charts/result-overview-chart";
    import { parseSelectionIds, parseDashboardYear } from "./src/lib/dashboard-filters";
    import { dashboardRespondentAgeGroupOptions, dashboardMotocrossClassOptions, dashboardRespondentRoleOptions } from "./src/lib/survey-segments";
    const params = new URLSearchParams(location.search);
    const isTest = params.get("dataMode") === "test", club = {isTest};
    const currentYear = 2026, selectedYear = parseDashboardYear(params.get("year"));
    const clubs = [{id:"a",name:"Eksempelklub A"},{id:"b",name:"Eksempelklub B med et længere klubnavn"}];
    const selectedClubIds = params.getAll("clubIds");
    const availableTemplates = [{id:"t",name:"Evaluering af løbsdagen",surveyType:"EVENT",_count:{surveyInstances:1}}];
    const selectedTemplate = availableTemplates.find(t=>t.id===params.get("surveyTemplateId"));
    const availableSurveys = ["Forårsløb", "Efterårsløb"].map((name,index)=>({id:String(index),name,club:{name:"Eksempelklub"}}));
    const selectedSurveyIds = parseSelectionIds(params.getAll("surveyInstanceId"));
    const respondentAgeGroupFilter = params.get("respondentAgeGroup") || "";
    const motocrossClassFilter = params.get("motocrossClass") || "";
    const respondentRoleFilter = params.get("respondentRole") || "";
    const surveyActionLinks = [{href:"/dmu/surveys",label:"Udsend spørgeskema"},{href:"/dmu/events",label:"Kalender"}];
    const dashboardLinks = [{href:"/club/overview",label:"Overblik"},{href:"/club/events",label:"Arrangementer"}];
    const exportHref = "#", exportParams = params;
    const overviewSeries = ["Forårsløb", "Efterårsløb"].map((label,index)=>({id:String(index),label:label+" · Eksempelklub · 17.9.2026",questions:["Overordnet","Bane","Sikkerhed","Faciliteter","Stemning"].map((category,i)=>({id:String(i),title:"Hvor tilfreds var du med "+category.toLowerCase()+"?",category,sum:15+i+index,count:5}))}));
    const chosen = selectedSurveyIds.length ? overviewSeries.filter(s=>selectedSurveyIds.includes(s.id)) : overviewSeries;
    const chartSeries = selectedSurveyIds.length > 1 ? chosen : [{id:"aggregate",label:selectedSurveyIds.length ? chosen[0]?.label : "Samlede resultater",questions:(chosen[0]?.questions??[]).map(q=>({...q,sum:chosen.reduce((sum,s)=>sum+s.questions.find(other=>other.id===q.id).sum,0),count:chosen.reduce((count,s)=>count+s.questions.find(other=>other.id===q.id).count,0)}))}];
    function DashboardFixture(){return <>{location.pathname.startsWith("/club") ? (${panels[1]}) : (${panels[0]})}<ResultOverviewChart series={chartSeries} comparison={selectedSurveyIds.length > 1}/></>;}
  `;
}

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { AppShell } from "./src/components/app-shell";
    ${dashboardFixture}
    const mobile = new URLSearchParams(location.search).has("mobile");
    createRoot(document.getElementById("root")).render(<div style={mobile ? {width:375,maxWidth:"100%",margin:"auto"} : {}}>
      <AppShell areaLabel="DMU administrator" userName="Test Administrator" navItems={[
        {href:"/dmu/dashboard",label:"Dashboard",icon:"dashboard"},
        {href:"/dmu/templates",label:"Spørgsmål & skabeloner",icon:"content"},
        {href:"/dmu/surveys",label:"Udsend spørgeskema",icon:"deliveries"},
        {href:"/dmu/events",label:"Kalender",icon:"events"},
        {href:"/dmu/settings",label:"Indstillinger",icon:"users"}
      ]}>
        ${dashboardFixture ? "<DashboardFixture />" : '<section className="rounded-[2rem] bg-primary p-6 text-primary-foreground"><p>ANALYSE</p><h1 className="mt-2 text-3xl font-bold">National analyse</h1><p className="mt-4">Isoleret designvisning – ingen produktionsdata.</p></section>'}
        <section className="rounded-[2rem] border bg-card p-6"><h2 className="text-2xl font-semibold">Spørgsmålsfordeling</h2><div className="mt-6 rounded-2xl bg-muted p-12 text-center text-muted-foreground">Lokal designvisning med opdigtede tal.</div></section>
      </AppShell>
    </div>);
  ` },
  bundle: true, write: false, format: "iife", jsx: "automatic", loader: { ".png": "dataurl" },
  alias: { "@": path.resolve("src") }, define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{name:"next-fixture",setup(builder){
    builder.onResolve({filter:/^next\/(navigation|link|image)$/},args=>({path:args.path,namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"jsx",contents:
      args.path.endsWith("navigation") ? 'export const usePathname=()=>"/dmu/dashboard";' :
      args.path.endsWith("image") ? 'import React from "react"; export default function Image({priority,...props}){return <img {...props}/>;}' :
      'import React from "react"; export default function Link(props){return <a {...props}/>;}',resolveDir:process.cwd()}));
  }}],
});
const cssPath = path.resolve("src/app/globals.css");
const css = await postcss([tailwind()]).process(await readFile(cssPath,"utf8"),{from:cssPath});
const html = `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Topbar – lokal designvisning</title><link rel="stylesheet" href="/style.css"><style>:root{--font-inter:Arial,sans-serif;--font-manrope:Arial,sans-serif}</style><div id="root"></div><script src="/fixture.js"></script></html>`;
createServer((req,res)=>{
  // The preview must never execute the real logout or navigate into production.
  if(req.method!=="GET"){res.writeHead(405);res.end();return;}
  res.setHeader("Content-Type",req.url==="/fixture.js"?"text/javascript":req.url==="/style.css"?"text/css":"text/html; charset=utf-8");
  res.end(req.url==="/fixture.js"?bundle.outputFiles[0].contents:req.url==="/style.css"?css.css:html);
}).listen(4320,"127.0.0.1",()=>console.log("Shell preview: http://127.0.0.1:4320"));
