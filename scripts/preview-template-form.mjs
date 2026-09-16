// Isolated browser regression fixture: real React form, simulated server action.
// No authentication, database connection, production writes or emails.
import { build } from "esbuild";
import { createServer } from "node:http";
import path from "node:path";

const output = await build({
  stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { CreateTemplateForm } from "./src/app/dmu/templates/create-template-form";
    window.calls = []; window.saved = new Map();
    const action = async (_previous, data) => {
      const values = Object.fromEntries(data); values.questionIds = data.getAll("questionIds"); window.calls.push(values);
      await new Promise(resolve => setTimeout(resolve, 1200));
      const mode = document.querySelector("#mode").value;
      if (mode === "network") throw new Error("simulated network error");
      if (mode === "error") return { status: "error", message: "Simuleret gemmefejl. Prøv igen." };
      window.saved.set(values.requestId, values);
      return { status: "success", message: "Skabelonen er oprettet.", templateId: values.requestId };
    };
    createRoot(document.querySelector("#root")).render(<CreateTemplateForm action={action}
      requestId="f5fc3d94-4d9a-4f3c-a2b2-1c08e0122222" initialCategory="" questions={[
        {id:"q1",title:"Baneforhold",questionType:"SCALE_1_5",benchmarkKey:"BANE_1"},
        {id:"q2",title:"Hvad fungerede godt?",questionType:"TEXT",benchmarkKey:null}
      ]} />);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": path.resolve("src") },
  plugins: [{ name: "isolated-router", setup(build) {
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents:
      'const router = { push(url) { document.querySelector("#navigation").textContent = url; } }; export const useRouter = () => router;' }));
  } }],
});
const html = `<!doctype html><html lang="da"><meta charset="utf-8"><title>Isoleret formulartest</title>
<style>body{font:16px system-ui;margin:32px;max-width:900px}label{display:block}input:not([type=checkbox]),select{display:block;margin:8px 0;padding:8px}button{padding:10px;margin:12px 0}svg{width:16px;height:16px}fieldset{border:0;padding:0}p[role=alert]{color:#a00}</style>
<label>Testtilstand<select id="mode"><option value="success">Succes</option><option value="error">Serverfejl</option><option value="network">Netværksfejl</option></select></label>
<div id="root"></div><output id="navigation"></output><script src="/fixture.js"></script></html>`;
createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/fixture.js" ? "text/javascript" : "text/html; charset=utf-8");
  response.end(request.url === "/fixture.js" ? output.outputFiles[0].contents : html);
}).listen(4319, "127.0.0.1", () => console.log("Isolated form fixture: http://127.0.0.1:4319"));
