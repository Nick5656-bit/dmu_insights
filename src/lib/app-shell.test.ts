import assert from "node:assert/strict";
import test from "node:test";
import { findElements, loadTestModule } from "./test-module-loader";
import type * as Shell from "../components/app-shell";

test("shared admin header stays in document flow and preserves logout and both navigations", () => {
  const AppNav = () => null;
  const Button = () => null;
  const { AppShell } = loadTestModule<typeof Shell>("src/components/app-shell.tsx", {
    "@/components/app-nav": { AppNav },
    "@/components/ui/button": { Button },
    "@/components/dmu-logo": { DmuLogo: () => null },
  });
  for (const areaLabel of ["DMU administrator", "Klubadministrator"]) {
    const navItems = [{ href: "/dashboard", label: "Dashboard" }];
    const tree = AppShell({ areaLabel, userName: "Test Administrator", navItems, children: "Sideindhold" });
    const [header] = findElements(tree, "header");
    assert.doesNotMatch(String(header.props.className), /sticky|fixed|backdrop|shadow|rounded/);
    assert.match(String(header.props.className), /border-b/);
    assert.match(String(findElements(tree, "aside")[0].props.className), /sticky/);
    const [form] = findElements(header, "form");
    assert.equal(form.props.action, "/api/auth/logout");
    assert.equal(form.props.method, "post");
    assert.equal(findElements(form, Button)[0].props.type, "submit");
    assert.equal(findElements(tree, AppNav).length, 2);
    assert.equal(findElements(tree, "main")[0].props.children, "Sideindhold");
  }
});
