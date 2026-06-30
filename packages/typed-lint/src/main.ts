import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { API } from "typescript/unstable/sync";

import type { RuleDiagnostic, TypedRule } from "./rule.ts";
import preferEffectArrayMatch from "./rules/prefer-effect-array-match.ts";
import preferTypedSchemaApis from "./rules/prefer-typed-schema-apis.ts";

const _rules: ReadonlyArray<TypedRule> = [
  preferEffectArrayMatch,
  preferTypedSchemaApis,
];

const _workspaceRoots = ["apps", "packages"];

const _excludedProjectDirectories = new Set([
  "packages/oxc",
  "packages/typed-lint",
]);

const _formatDiagnostic = ({
  column,
  fileName,
  line,
  message,
  ruleName,
}: RuleDiagnostic) => `${fileName}:${line}:${column} ${ruleName} ${message}`;

const _toPosixPath = ({ value }: { value: string }) =>
  value.split(path.sep).join("/");

const _getWorkspaceProjectPaths = () => {
  const projectPaths: Array<string> = [];

  for (const workspaceRoot of _workspaceRoots) {
    if (!fs.existsSync(workspaceRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(workspaceRoot, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDirectory = path.join(workspaceRoot, entry.name);
      const normalizedProjectDirectory = _toPosixPath({
        value: projectDirectory,
      });

      if (_excludedProjectDirectories.has(normalizedProjectDirectory)) {
        continue;
      }

      const projectPath = path.join(projectDirectory, "tsconfig.json");

      if (fs.existsSync(projectPath)) {
        projectPaths.push(projectPath);
      }
    }
  }

  return projectPaths.sort((left, right) => left.localeCompare(right));
};

const _isProjectSourceFile = ({
  fileName,
  rootDir,
}: {
  fileName: string;
  rootDir: string;
}) => {
  const relative = path.relative(rootDir, fileName);

  return (
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    !fileName.endsWith(".d.ts") &&
    !relative.includes("node_modules") &&
    !relative.includes(`${path.sep}.expo${path.sep}`) &&
    !relative.includes(`${path.sep}scripts${path.sep}`)
  );
};

const _getLineStarts = ({ text }: { text: string }) => {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);

    if (char === 10) {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
};

const _getLineAndColumn = ({
  lineStarts,
  position,
}: {
  lineStarts: ReadonlyArray<number>;
  position: number;
}) => {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = lineStarts[middle];
    const nextStart = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;

    if (start === undefined) {
      break;
    }

    if (position < start) {
      high = middle - 1;
    } else if (position >= nextStart) {
      low = middle + 1;
    } else {
      return {
        column: position - start + 1,
        line: middle + 1,
      };
    }
  }

  return {
    column: 1,
    line: 1,
  };
};

const _getNodeStart = ({
  end,
  position,
  text,
}: {
  end: number;
  position: number;
  text: string;
}) => {
  let index = position;

  while (index < end && /\s/.test(text[index] ?? "")) {
    index += 1;
  }

  return index;
};

const _runProject = ({
  api,
  diagnostics,
  projectPath,
}: {
  api: API;
  diagnostics: Array<RuleDiagnostic>;
  projectPath: string;
}) => {
  const absoluteProjectPath = path.resolve(projectPath);
  const rootDir = path.dirname(absoluteProjectPath);
  const snapshot = api.updateSnapshot({ openProject: absoluteProjectPath });
  const project = snapshot.getProject(absoluteProjectPath);

  if (project === undefined) {
    throw new Error(`Unable to load ${projectPath}`);
  }

  for (const fileName of project.rootFiles) {
    const sourceFile = project.program.getSourceFile(fileName);

    if (
      sourceFile === undefined ||
      !_isProjectSourceFile({
        fileName: sourceFile.fileName,
        rootDir,
      })
    ) {
      continue;
    }

    const lineStarts = _getLineStarts({ text: sourceFile.text });

    for (const rule of _rules) {
      rule.check({
        checker: project.checker,
        getLineAndColumn: (position) =>
          _getLineAndColumn({ lineStarts, position }),
        getNodeStart: (node) =>
          _getNodeStart({
            end: node.end,
            position: node.pos,
            text: sourceFile.text,
          }),
        project,
        report: (diagnostic) => {
          diagnostics.push({
            ...diagnostic,
            ruleName: rule.name,
          });
        },
        sourceFile,
      });
    }
  }

  snapshot.dispose();
};

const _main = () => {
  const diagnostics: Array<RuleDiagnostic> = [];
  const projectPaths = _getWorkspaceProjectPaths();
  const api = new API({ cwd: process.cwd() });

  for (const projectPath of projectPaths) {
    _runProject({ api, diagnostics, projectPath });
  }

  api.close();

  const seen = new Set<string>();
  const uniqueDiagnostics = diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.fileName}:${diagnostic.line}:${diagnostic.column}:${diagnostic.ruleName}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  uniqueDiagnostics.sort((left, right) =>
    _formatDiagnostic(left).localeCompare(_formatDiagnostic(right))
  );

  for (const diagnostic of uniqueDiagnostics) {
    console.error(_formatDiagnostic(diagnostic));
  }

  if (uniqueDiagnostics.length > 0) {
    process.exitCode = 1;
  }
};

_main();
