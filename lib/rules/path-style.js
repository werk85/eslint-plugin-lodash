/**
 * @fileoverview Rule to check if there's a JS native method in the lodash chain
 */
'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

var getDocsUrl = require('../util/getDocsUrl');

module.exports = {
    meta: {
        docs: {
            url: getDocsUrl('path-style')
        },
        schema: [{
            enum: ['as-needed', 'array', 'string']
        }],
        fixable: 'code',
        messages: {
            stringForSimple: 'Use a string for simple paths',
            arrayForVars: 'Use an array for paths with variables',
            array: 'Use an array for paths',
            string: 'Use a string for paths'
        }
    },

    create: function create(context) {
        var _require = require('../util/lodashUtil'),
            getLodashMethodVisitors = _require.getLodashMethodVisitors;

        var _require2 = require('../util/methodDataUtil'),
            isAliasOfMethod = _require2.isAliasOfMethod;

        var objectPathMethods = {
            regular: { methods: ['get', 'has', 'hasIn', 'set', 'unset', 'invoke'], index: 1 },
            higherOrder: { methods: ['property', 'matchesProperty'], index: 0 }
        };
        var find = require('lodash/find');
        var findIndex = require('lodash/findIndex');
        var some = require('lodash/some');
        var every = require('lodash/every');
        var matches = require('lodash/matches');
        var toPath = require('lodash/toPath');
        var isPropAccess = function isPropAccess(x) {
            return x === '.' || x === '[';
        };

        function endsWithPropAccess(str) {
            return isPropAccess(str[str.length - 1]);
        }

        function startsWithPropAccess(str) {
            return isPropAccess(str[0]);
        }

        function getIndexByMethodName(method, version) {
            var isAliasOfSuspect = function isAliasOfSuspect(m) {
                return isAliasOfMethod(version, m, method);
            };
            var pathMethodGroup = find(objectPathMethods, function (type) {
                return some(type.methods, isAliasOfSuspect);
            });
            return pathMethodGroup ? pathMethodGroup.index : -1;
        }

        function getPropertyPathNode(node, method, version, callType) {
            var index = getIndexByMethodName(method, version);
            return node.arguments[callType === 'chained' ? index - 1 : index];
        }

        var isArrayExpression = matches({ type: 'ArrayExpression' });
        var isLiteral = matches({ type: 'Literal' });
        var isAddition = matches({ type: 'BinaryExpression', operator: '+' });
        var isTemplateLiteral = matches({ type: 'TemplateLiteral' });

        function isArrayOfLiterals(node) {
            return isArrayExpression(node) && every(node.elements, isLiteral);
        }

        function isAdjacentToPropAccessInTemplate(exp, literal) {
            var quasiAfterIndex = findIndex(literal.quasis, function (quasi) {
                return quasi.start > exp.end;
            });
            var quasiBefore = literal.quasis[quasiAfterIndex - 1];
            var quasiAfter = literal.quasis[quasiAfterIndex];
            return quasiBefore && endsWithPropAccess(quasiBefore.value.raw) || quasiAfter && startsWithPropAccess(quasiAfter.value.raw);
        }

        function isTemplateStringWithVariableProps(node) {
            return isTemplateLiteral(node) && some(node.expressions, function (exp) {
                return isAdjacentToPropAccessInTemplate(exp, node);
            });
        }

        function isStringConcatWithVariableProps(node) {
            return isAddition(node) && (isLiteral(node.left) && endsWithPropAccess(node.left.value) || isLiteral(node.right) && startsWithPropAccess(node.right.value));
        }

        function canBeDotNotation(node) {
            return node.value && /^[a-zA-z0-9_$][\w\$]*$/.test(node.value);
        }

        function convertToStringStyleWithoutVariables(node) {
            return '\'' + node.elements.map(function (el) {
                return canBeDotNotation(el) ? '.' + el.value : '[' + el.value + ']';
            }).join('').replace(/^\./, '') + '\'';
        }

        function convertToStringStyleWithVariables(node) {
            return '`' + node.elements.map(function (el) {
                if (canBeDotNotation(el)) {
                    return '.' + el.value;
                }
                if (isLiteral(el)) {
                    return '[' + el.value + ']';
                }
                return '${' + context.getSourceCode().getText(el) + '}';
            }).join('').replace(/^\./, '') + '`';
        }

        function convertToStringStyle(node, hasVariables) {
            if (!hasVariables || isArrayOfLiterals(node)) {
                return convertToStringStyleWithoutVariables(node);
            }
            return convertToStringStyleWithVariables(node);
        }

        var reportIfViolates = {
            'as-needed': function asNeeded(node) {
                if (isArrayOfLiterals(node)) {
                    context.report({
                        node: node,
                        messageId: 'stringForSimple',
                        fix: function fix(fixer) {
                            return fixer.replaceText(node, convertToStringStyle(node, false));
                        }
                    });
                } else if (isStringConcatWithVariableProps(node)) {
                    context.report({
                        node: node,
                        messageId: 'arrayForVars'
                    });
                } else if (isTemplateStringWithVariableProps(node)) {
                    context.report({
                        node: node,
                        messageId: 'arrayForVars'
                    });
                }
            },
            array: function array(node) {
                if (isLiteral(node)) {
                    context.report({
                        node: node,
                        messageId: 'array',
                        fix: function fix(fixer) {
                            return fixer.replaceText(node, '[' + toPath(node.value).map(function (x) {
                                return '\'' + x + '\'';
                            }).join(', ') + ']');
                        }
                    });
                } else if (isTemplateLiteral(node)) {
                    context.report({
                        node: node,
                        messageId: 'array'
                    });
                }
            },
            string: function string(node) {
                if (isArrayExpression(node)) {
                    context.report({
                        node: node,
                        messageId: 'string',
                        fix: function fix(fixer) {
                            return fixer.replaceText(node, convertToStringStyle(node, true));
                        }
                    });
                }
            }
        };

        return getLodashMethodVisitors(context, function (node, iteratee, _ref) {
            var method = _ref.method,
                version = _ref.version,
                callType = _ref.callType;

            var propertyPathNode = getPropertyPathNode(node, method, version, callType);
            if (propertyPathNode) {
                reportIfViolates[context.options[0] || 'as-needed'](propertyPathNode);
            }
        });
    }
};