import PDFDocument from "pdfkit";
import path from "node:path";
import { buildResultOverview, type OverviewSeries } from "./result-overview";
import { SUPPRESSION_THRESHOLD, type QuestionResult } from "./survey-results";

export type ResultsPdfInput = {
  scope: string;
  filters: string[];
  results: QuestionResult[];
  series: OverviewSeries[];
  comparison: boolean;
  generatedAt?: Date;
};

const navy = "#10244D", ink = "#243247", muted = "#59677B", line = "#DFE5ED";
const seriesColors = ["#304F83", "#16796F", "#8865A7", "#B66F27", "#547C9B", "#A45167"];
const scaleColors = ["#C54545", "#DF8642", "#C7A331", "#7BA559", "#26845B"];
const number = (value: number) => value.toLocaleString("da-DK", { maximumFractionDigits: 2 });
// Normalize typographic dashes for portable text extraction and printing.
const clean = (text: string) => text.normalize("NFC").replace(/[\u2010-\u2015]/g, "-").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export async function renderResultsPdf(input: ResultsPdfInput): Promise<Buffer> {
  const regularFont = path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff");
  const boldFont = path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff");
  const doc = new PDFDocument({ size: "A4", margins: { top: 82, bottom: 60, left: 44, right: 44 }, bufferPages: true,
    font: regularFont,
    info: { Title: "DMU Insights - Resultatrapport", Author: "Danmarks Motor Union", Subject: clean(input.scope) },
  });
  doc.registerFont("regular", regularFont);
  doc.registerFont("bold", boldFont);
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 44, width = doc.page.width - 88, bottom = doc.page.height - 60;
  function header() {
    doc.image(path.join(process.cwd(), "public/dmu-logo.png"), left, 25, { fit: [100, 39] });
    doc.font("bold").fontSize(10).fillColor(navy).text("DMU INSIGHTS", left + 150, 33, { width: width - 150, align: "right", lineBreak: false });
    doc.moveTo(left, 70).lineTo(left + width, 70).strokeColor(line).lineWidth(0.7).stroke();
    doc.x = left; doc.y = 84;
  }
  // Draw page furniture after pagination, so a page break inside a long answer
  // cannot change its font or colour halfway through the paragraph.
  doc.y = 84;
  const ensure = (height: number) => { if (doc.y + height > bottom) doc.addPage(); };
  function questionSpace(question: QuestionResult) {
    doc.font("bold").fontSize(11);
    const titleHeight = doc.heightOfString(clean(question.questionTitle), { width, lineGap: 3 });
    return question.questionType === "SCALE_1_5" && !question.suppressed && question.count >= SUPPRESSION_THRESHOLD
      ? titleHeight + 270 : Math.min(180, titleHeight + 75);
  }
  function text(value: string, size = 10, bold = false, color = ink) {
    doc.font(bold ? "bold" : "regular").fontSize(size).fillColor(color);
    doc.text(clean(value), left, doc.y, { width, lineGap: 3 });
  }
  function heading(value: string) {
    ensure(75); doc.y += 16; text(value, 17, true, navy); doc.y += 9;
  }
  function divider() {
    doc.y += 8;
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(line).lineWidth(0.6).stroke();
    doc.y += 12;
  }
  function bar(label: string, value: number, max: number, detail: string, color: string, compact = false) {
    doc.font("regular").fontSize(10);
    ensure(doc.heightOfString(clean(label), { width, lineGap: 3 }) + (compact ? 34 : 42));
    text(label, 10);
    const y = doc.y + 3;
    const plotWidth = width - 112;
    doc.roundedRect(left, y, plotWidth, 9, 3).fill("#EDF1F6");
    const barWidth = max > 0 ? Math.min(plotWidth, plotWidth * value / max) : 0;
    if (barWidth > 0) doc.roundedRect(left, y, Math.max(barWidth, 2), 9, 2).fill(color);
    doc.font("bold").fontSize(9).fillColor(ink).text(detail, left + plotWidth + 10, y - 3, { width: 102, align: "right", lineBreak: false });
    doc.y = y + (compact ? 18 : 26); doc.x = left;
  }

  text("Resultatrapport", 28, true, navy); doc.y += 5;
  text(input.scope, 12, true);
  text(`Udarbejdet ${new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "long", timeStyle: "short" }).format(input.generatedAt ?? new Date())}`, 9, false, muted);
  divider();
  text("VALGT UDSNIT", 9, true, muted); doc.y += 4;
  for (const filter of input.filters) { ensure(30); text(filter, 10); doc.y += 3; }
  divider();
  const eligible = input.results.filter(q => !q.suppressed && q.count >= SUPPRESSION_THRESHOLD);
  const hiddenCount = input.results.length - eligible.length;
  text(`${eligible.length} spørgsmål med resultater  ·  ${hiddenCount} spørgsmål beskyttet`, 11, true, navy);
  doc.y += 8;
  text("Rapporten følger dashboardets anvendte filtre. Resultater vises kun ved mindst fem gyldige svar på det enkelte spørgsmål i det valgte udsnit. Åbne svar vises uden deltageroplysninger eller svartidspunkter.", 9, false, muted);
  if (!input.results.length) { heading("Ingen resultater i dette udsnit"); text("Prøv at vælge andre filtre eller et arrangement med besvarelser."); }

  const overview = buildResultOverview(input.series);
  heading(input.comparison ? "Resultatoversigt - sammenligning" : "Resultatoversigt");
  if (!overview.rows.length) {
    text(input.comparison ? "Der er ikke tilstrækkeligt med svar på fælles skalaspørgsmål til at sammenligne de valgte arrangementer. De samlede spørgsmålsresultater vises nedenfor." : "Der er endnu ikke tilstrækkeligt med svar på skalaspørgsmål til at vise en samlet oversigt.", 10, false, muted);
  } else {
    for (let index = 0; index < overview.means.length; index++) {
      const mean = overview.means[index]; ensure(65);
      text(mean.label, 11, true, seriesColors[index % seriesColors.length]);
      text(`Samlet gennemsnit: ${number(mean.value!)} / 5`, 13, true, navy); doc.y += 10;
    }
    text("Gennemsnittet er beregnet af alle gyldige 1-5-svar på de inkluderede spørgsmål, vægtet efter antal svar. Tekstsvar og 'Ved ikke' indgår ikke. Ved sammenligning indgår kun fælles spørgsmål med mindst fem svar i hvert valgt arrangement.", 9, false, muted);
    doc.y += 14;
    for (const row of overview.rows) {
      doc.font("regular").fontSize(10);
      const groupHeight = 35 + overview.means.reduce((total, mean) => total + doc.heightOfString(clean(input.comparison ? mean.label : "Gennemsnit"), { width, lineGap: 3 }) + 42, 0);
      ensure(Math.min(groupHeight, bottom - 82));
      text(String(row.category), 11, true, navy); doc.y += 7;
      overview.means.forEach((mean, index) => {
        doc.font("regular").fontSize(10);
        const barHeight = doc.heightOfString(clean(input.comparison ? mean.label : "Gennemsnit"), { width, lineGap: 3 }) + 42;
        if (doc.y + barHeight > bottom) {
          doc.addPage(); text(`${row.category} (fortsat)`, 11, true, navy); doc.y += 7;
        }
        bar(input.comparison ? mean.label : "Gennemsnit", Number(row[mean.key]), 5, `${number(Number(row[mean.key]))} / 5`, seriesColors[index % seriesColors.length]);
      });
    }
    text(`Beregningsgrundlag: ${overview.questions.length} skalaspørgsmål. Søjlernes skala går fra 0 til 5.`, 9, false, muted);
  }

  if (input.results.length) {
    doc.addPage();
    heading("Resultater pr. spørgsmål");
    const categories = [...new Set(input.results.map(q => q.category))];
    for (const category of categories) {
      const questions = input.results.filter(q => q.category === category);
      ensure(Math.min(questionSpace(questions[0]) + 65, bottom - 82)); doc.y += 9;
      text(category, 13, true, navy); divider();
      for (const question of questions) {
        // Keep the five scale bars with their question whenever they fit on a page.
        ensure(questionSpace(question));
        text(question.questionTitle, 11, true);
        doc.y += 5;
        if (question.suppressed || question.count < SUPPRESSION_THRESHOLD) {
          text("Resultatet er beskyttet: færre end fem gyldige svar.", 9, false, muted); divider(); continue;
        }
        text(`${question.count} svar${question.avg !== null ? `  ·  Gennemsnit: ${number(question.avg)} / 5` : ""}`, 9, false, muted);
        doc.y += 10;
        if (question.questionType === "TEXT") {
          for (const [index, entry] of question.texts.entries()) {
            ensure(55);
            text(`Svar ${index + 1}`, 8, true, muted);
            text(entry.text, 10); doc.y += 12;
          }
        } else {
          for (const [index, bin] of question.distribution.entries()) {
            const percentage = Math.round(bin.value / question.count * 100);
            bar(question.questionType === "SCALE_1_5" ? `Karakter ${bin.label}` : bin.label, bin.value, question.count,
              `${bin.value} svar (${percentage} %)`, question.questionType === "SCALE_1_5" ? scaleColors[Number(bin.label) - 1] : seriesColors[index % seriesColors.length], true);
          }
          text(question.questionType === "SCALE_1_5" ? "Skala 1-5. Fordelingen viser andelen af gyldige svar." : "Fordelingen viser andelen af gyldige svar.", 8, false, muted);
        }
        divider();
      }
    }
  }
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(index); doc.page.margins.bottom = 0;
    header();
    doc.font("regular").fontSize(8).fillColor(muted)
      .text("DMU Insights · Resultater i valgt udsnit", left, doc.page.height - 34, { width: width - 80, lineBreak: false })
      .text(`${index + 1} / ${pages.count}`, left + width - 70, doc.page.height - 34, { width: 70, align: "right", lineBreak: false });
  }
  doc.end();
  return complete;
}
