import {
  isBinaryExpression,
  isNumericLiteral,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  SyntaxKind,
} from "typescript/unstable/ast";
import { TypeFlags } from "typescript/unstable/sync";

import type { Node } from "typescript/unstable/ast";
import type {
  Checker,
  Type,
  UnionOrIntersectionType,
} from "typescript/unstable/sync";
import type { RuleContext, TypedRule } from "../rule.ts";

const _isNumberLiteral = ({ node, value }: { node: Node; value: 0 | 1 }) =>
  isNumericLiteral(node) && Number(node.text) === value;

const _isAnyOrUnknown = ({ type }: { type: Type }) =>
  (type.flags & TypeFlags.Any) === TypeFlags.Any ||
  (type.flags & TypeFlags.Unknown) === TypeFlags.Unknown;

const _isUnionOrIntersection = (type: Type): type is UnionOrIntersectionType =>
  (type.flags & TypeFlags.UnionOrIntersection) !== 0 && "getTypes" in type;

const _isArrayType = ({
  checker,
  type,
}: {
  checker: Checker;
  type: Type;
}): boolean => {
  if (_isAnyOrUnknown({ type })) {
    return false;
  }

  if (_isUnionOrIntersection(type)) {
    return type
      .getTypes()
      .every((member) => _isArrayType({ checker, type: member }));
  }

  return checker.isArrayLikeType(type);
};

const _isArrayLength = ({
  context,
  node,
}: {
  context: RuleContext;
  node: Node;
}) => {
  if (!isPropertyAccessExpression(node) || node.name.text !== "length") {
    return false;
  }

  const type = context.checker.getTypeAtLocation(node.expression);

  return type === undefined
    ? false
    : _isArrayType({ checker: context.checker, type });
};

const _isEmptyLengthComparison = ({
  context,
  node,
}: {
  context: RuleContext;
  node: Node;
}) => {
  if (!isBinaryExpression(node)) {
    return false;
  }

  const leftIsLength = _isArrayLength({ context, node: node.left });
  const rightIsLength = _isArrayLength({ context, node: node.right });

  if (!leftIsLength && !rightIsLength) {
    return false;
  }

  switch (node.operatorToken.kind) {
    case SyntaxKind.EqualsEqualsEqualsToken:
    case SyntaxKind.EqualsEqualsToken:
    case SyntaxKind.ExclamationEqualsEqualsToken:
    case SyntaxKind.ExclamationEqualsToken:
      return leftIsLength
        ? _isNumberLiteral({ node: node.right, value: 0 })
        : _isNumberLiteral({ node: node.left, value: 0 });
    case SyntaxKind.GreaterThanToken:
      return (
        (leftIsLength && _isNumberLiteral({ node: node.right, value: 0 })) ||
        (rightIsLength && _isNumberLiteral({ node: node.left, value: 1 }))
      );
    case SyntaxKind.GreaterThanEqualsToken:
      return (
        (leftIsLength && _isNumberLiteral({ node: node.right, value: 1 })) ||
        (rightIsLength && _isNumberLiteral({ node: node.left, value: 0 }))
      );
    case SyntaxKind.LessThanToken:
      return (
        (leftIsLength && _isNumberLiteral({ node: node.right, value: 1 })) ||
        (rightIsLength && _isNumberLiteral({ node: node.left, value: 0 }))
      );
    case SyntaxKind.LessThanEqualsToken:
      return (
        (leftIsLength && _isNumberLiteral({ node: node.right, value: 0 })) ||
        (rightIsLength && _isNumberLiteral({ node: node.left, value: 1 }))
      );
    default:
      return false;
  }
};

const _report = ({ context, node }: { context: RuleContext; node: Node }) => {
  const position = context.getLineAndColumn(context.getNodeStart(node));

  context.report({
    column: position.column,
    fileName: context.sourceFile.fileName,
    line: position.line,
    message:
      "Use Array.match, Array.isReadonlyArrayNonEmpty, Array.isArrayNonEmpty, or NonEmptyArray from effect instead of checking array.length for emptiness.",
  });
};

const _checkNode = ({
  context,
  node,
}: {
  context: RuleContext;
  node: Node;
}) => {
  if (_isEmptyLengthComparison({ context, node })) {
    _report({ context, node });
    return;
  }

  if (
    isPrefixUnaryExpression(node) &&
    node.operator === SyntaxKind.ExclamationToken &&
    _isArrayLength({ context, node: node.operand })
  ) {
    _report({ context, node });
  }
};

const preferEffectArrayMatch: TypedRule = {
  name: "prefer-effect-array-match",
  check: (context) => {
    const visit = (node: Node) => {
      _checkNode({ context, node });
      node.forEachChild(visit);
    };

    visit(context.sourceFile);
  },
};

export default preferEffectArrayMatch;
