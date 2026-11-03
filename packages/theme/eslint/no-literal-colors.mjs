import namedColors from 'color-name';

const COLOR_SYNTAX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-z])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const COLOR_PROPERTY = /color|background|border|outline|fill|stroke|shadow/i;
const TAILWIND_ARBITRARY_VALUE = /-\[(?:color:)?([a-z]+)\]/gi;
const VALUE_WRAPPERS = new Set(['TemplateLiteral', 'JSXExpressionContainer', 'ConditionalExpression', 'LogicalExpression']);

const isNamedColor = (word) => Object.hasOwn(namedColors, word.toLowerCase());

const hasNamedColor = (text) => text.split(/[\s,()]+/).some(isNamedColor);

const hasTailwindNamedColor = (text) =>
  [...text.matchAll(TAILWIND_ARBITRARY_VALUE)].some(([, value]) => isNamedColor(value));

const isLiteralColor = (text) => COLOR_SYNTAX.test(text) || hasTailwindNamedColor(text);

function isHrefValue(node) {
  let owner = node.parent;
  while (VALUE_WRAPPERS.has(owner.type)) owner = owner.parent;
  return (
    (owner.type === 'JSXAttribute' && owner.name.name === 'href') ||
    (owner.type === 'Property' && owner.key.name === 'href')
  );
}

export const noLiteralColors = {
  meta: {
    type: 'problem',
    messages: { literalColor: 'Use a color token from packages/theme, not a literal color.' },
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: 'literalColor' });

    function checkNamedColorValue(name, valueNode) {
      const isNamedColorValue =
        COLOR_PROPERTY.test(name) &&
        valueNode?.type === 'Literal' &&
        typeof valueNode.value === 'string' &&
        isNamedColor(valueNode.value);
      if (isNamedColorValue) report(valueNode);
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && isLiteralColor(node.value) && !isHrefValue(node)) report(node);
      },
      TemplateElement(node) {
        if (isLiteralColor(node.value.raw) && !isHrefValue(node)) report(node);
      },
      Property(node) {
        checkNamedColorValue(node.key.name ?? String(node.key.value), node.value);
      },
      JSXAttribute(node) {
        checkNamedColorValue(String(node.name.name), node.value);
      },
      Declaration(node) {
        const declaration = context.sourceCode.getText(node);
        const isNamedColorDeclaration = COLOR_PROPERTY.test(node.property) && hasNamedColor(declaration);
        if (COLOR_SYNTAX.test(declaration) || isNamedColorDeclaration) report(node);
      },
    };
  },
};
