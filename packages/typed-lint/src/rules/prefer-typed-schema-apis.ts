import {
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isNamedImports,
  isPropertyAccessExpression,
  isStringLiteral,
} from "typescript/unstable/ast";
import { TypeFlags } from "typescript/unstable/sync";

import type { Node, SourceFile } from "typescript/unstable/ast";
import type { Checker, Type } from "typescript/unstable/sync";
import type { RuleContext, TypedRule } from "../rule.ts";

const _decodeMethods = new Map([
  ["decodeUnknownEffect", "decodeEffect"],
  ["decodeUnknownExit", "decodeExit"],
  ["decodeUnknownOption", "decodeOption"],
  ["decodeUnknownResult", "decodeResult"],
  ["decodeUnknownPromise", "decodePromise"],
  ["decodeUnknownSync", "decodeSync"],
]);

const _encodeMethods = new Map([
  ["encodeUnknownEffect", "encodeEffect"],
  ["encodeUnknownExit", "encodeExit"],
  ["encodeUnknownOption", "encodeOption"],
  ["encodeUnknownResult", "encodeResult"],
  ["encodeUnknownPromise", "encodePromise"],
  ["encodeUnknownSync", "encodeSync"],
]);

const _getEffectSchemaImportNames = ({
  sourceFile,
}: {
  sourceFile: SourceFile;
}) => {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !isImportDeclaration(statement) ||
      !isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "effect" ||
      statement.importClause?.namedBindings === undefined ||
      !isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (importedName === "Schema") {
        names.add(element.name.text);
      }
    }
  }

  return names;
};

const _isAnyOrUnknown = ({ flags }: { flags: TypeFlags }) =>
  (flags & TypeFlags.Any) === TypeFlags.Any ||
  (flags & TypeFlags.Unknown) === TypeFlags.Unknown;

const _getPropertyType = ({
  checker,
  name,
  node,
  type,
}: {
  checker: Checker;
  name: "Encoded" | "Type";
  node: Node;
  type: Type;
}) => {
  const property = checker
    .getPropertiesOfType(type)
    .find((symbol) => symbol.name === name);

  if (property === undefined) {
    return undefined;
  }

  return checker.getTypeOfSymbolAtLocation(property, node);
};

const _checkNode = ({
  context,
  node,
  schemaImportNames,
}: {
  context: RuleContext;
  node: Node;
  schemaImportNames: ReadonlySet<string>;
}) => {
  if (
    !isCallExpression(node) ||
    !isCallExpression(node.expression) ||
    node.arguments.length === 0
  ) {
    return;
  }

  const input = node.arguments[0];

  if (input === undefined) {
    return;
  }

  const schemaCall = node.expression;
  const schema = schemaCall.arguments[0];

  if (
    schemaCall.arguments.length !== 1 ||
    schema === undefined ||
    !isPropertyAccessExpression(schemaCall.expression) ||
    !isIdentifier(schemaCall.expression.expression)
  ) {
    return;
  }

  const schemaIdentifier = schemaCall.expression.expression;
  const unknownMethod = schemaCall.expression.name.text;
  const decodeMethod = _decodeMethods.get(unknownMethod);
  const encodeMethod = _encodeMethods.get(unknownMethod);

  if (
    !schemaImportNames.has(schemaIdentifier.text) ||
    (decodeMethod === undefined && encodeMethod === undefined)
  ) {
    return;
  }

  const inputType = context.checker.getTypeAtLocation(input);

  if (inputType === undefined || _isAnyOrUnknown({ flags: inputType.flags })) {
    return;
  }

  const schemaType = context.checker.getTypeAtLocation(schema);

  if (schemaType === undefined) {
    return;
  }

  const expectedType = _getPropertyType({
    checker: context.checker,
    name: decodeMethod === undefined ? "Type" : "Encoded",
    node: schema,
    type: schemaType,
  });

  if (
    expectedType === undefined ||
    _isAnyOrUnknown({ flags: expectedType.flags }) ||
    !context.checker.isTypeAssignableTo(inputType, expectedType)
  ) {
    return;
  }

  const replacement = decodeMethod ?? encodeMethod;

  if (replacement === undefined) {
    return;
  }

  const position = context.getLineAndColumn(
    context.getNodeStart(schemaCall.expression.name)
  );

  context.report({
    column: position.column,
    fileName: context.sourceFile.fileName,
    line: position.line,
    message: `Prefer Schema.${replacement} when input is already typed as the schema ${
      decodeMethod === undefined ? "Type" : "Encoded"
    }. Replace Schema.${unknownMethod} with Schema.${replacement}.`,
  });
};

const preferTypedSchemaApis: TypedRule = {
  name: "prefer-typed-schema-apis",
  check: (context) => {
    const schemaImportNames = _getEffectSchemaImportNames({
      sourceFile: context.sourceFile,
    });

    if (schemaImportNames.size === 0) {
      return;
    }

    const visit = (node: Node) => {
      _checkNode({ context, node, schemaImportNames });
      node.forEachChild(visit);
    };

    visit(context.sourceFile);
  },
};

export default preferTypedSchemaApis;
