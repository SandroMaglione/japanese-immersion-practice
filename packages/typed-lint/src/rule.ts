import type { Node, SourceFile } from "typescript/unstable/ast";
import type { Checker, Project } from "typescript/unstable/sync";

export type RuleDiagnostic = {
  column: number;
  fileName: string;
  line: number;
  message: string;
  ruleName: string;
};

export type RuleContext = {
  checker: Checker;
  getLineAndColumn: (position: number) => {
    column: number;
    line: number;
  };
  getNodeStart: (node: Node) => number;
  project: Project;
  report: (diagnostic: Omit<RuleDiagnostic, "ruleName">) => void;
  sourceFile: SourceFile;
};

export type TypedRule = {
  check: (context: RuleContext) => void;
  name: string;
};
