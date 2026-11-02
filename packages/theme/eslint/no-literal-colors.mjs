import namedColors from 'color-name';

const COLOR_SYNTAX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const COLOR_PROPERTY = /color|background|border|outline|fill|stroke|shadow/i;
const TAILWIND_ARBITRARY_VALUE = /-\[(?:color:)?([a-z]+)\]/gi;

const hasNamedColor = (text) => text.split(/[\s,()]+/).some((word) => word.toLowerCase() in namedColors);

const hasTailwindNamedColor = (text) =>
  [...text.matchAll(TAILWIND_ARBITRARY_VALUE)].some(([, value]) => value.toLowerCase() in namedColors);

const isLiteralColor = (text) => COLOR_SYNTAX.test(text) || hasTailwindNamedColor(text);

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
        hasNamedColor(valueNode.value);
      if (isNamedColorValue) report(valueNode);
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && isLiteralColor(node.value)) report(node);
      },
      TemplateElement(node) {
        if (isLiteralColor(node.value.raw)) report(node);
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
