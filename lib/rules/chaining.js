/**
 * @fileoverview Rule to check if the expression could be better expressed as a chain
 */
'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

var getDocsUrl = require('../util/getDocsUrl');

module.exports = {
    meta: {
        docs: {
            url: getDocsUrl('chaining')
        },
        schema: [{
            enum: ['always', 'never', 'implicit']
        }, {
            type: 'integer',
            minimum: 2
        }],
        messages: {
            single: 'Do not use chain syntax for single method',
            never: 'Prefer composition to Lodash chaining',
            always: 'Prefer chaining to composition'
        }
    },

    create: function create(context) {
        var _require = require('../util/lodashUtil'),
            getLodashContext = _require.getLodashContext,
            isChainBreaker = _require.isChainBreaker;

        var _require2 = require('../util/astUtil'),
            isMethodCall = _require2.isMethodCall,
            isObjectOfMethodCall = _require2.isObjectOfMethodCall,
            getMethodName = _require2.getMethodName;

        var _require3 = require('../util/methodDataUtil'),
            isChainable = _require3.isChainable;

        var DEFAULT_LENGTH = 3;
        var lodashContext = getLodashContext(context);
        var version = lodashContext.version;
        var negate = require('lodash/negate');

        var mode = context.options[0] || 'never';
        var ruleDepth = parseInt(context.options[1], 10) || DEFAULT_LENGTH;

        var isEndOfChain = negate(isObjectOfMethodCall);

        function isBeforeChainBreaker(node) {
            return isChainBreaker(node.parent.parent, version);
        }

        function isNestedNLevelsInner(node, n, includeUnchainable) {
            if (n === 0) {
                return true;
            }
            if (lodashContext.isLodashCall(node) && (includeUnchainable || isChainable(version, getMethodName(node)))) {
                return isNestedNLevelsInner(node.arguments[0], n - 1);
            }
            var importedLodashMethod = lodashContext.getImportedLodashMethod(node);
            if (importedLodashMethod && (includeUnchainable || isChainable(version, importedLodashMethod))) {
                return isNestedNLevelsInner(node.arguments[0], n - 1);
            }
        }

        function isNestedNLevels(node, n, includeUnchainable) {
            if (includeUnchainable) {
                return isNestedNLevelsInner(node, n, includeUnchainable);
            }
            if (lodashContext.isLodashCall(node) || lodashContext.getImportedLodashMethod(node)) {
                return isNestedNLevelsInner(node.arguments[0], n - 1, false);
            }
        }

        var callExpressionVisitors = {
            always: function always(node) {
                if (isNestedNLevels(node, ruleDepth, true)) {
                    context.report({ node: node, messageId: 'always' });
                } else if (lodashContext.isLodashChainStart(node)) {
                    var firstCall = node.parent.parent;
                    if (isMethodCall(firstCall) && (isEndOfChain(firstCall) || isBeforeChainBreaker(firstCall))) {
                        context.report({ node: firstCall, messageId: 'single' });
                    }
                }
            },
            never: function never(node) {
                if (lodashContext.isLodashChainStart(node)) {
                    context.report({ node: node, messageId: 'never' });
                }
            },
            implicit: function implicit(node) {
                if (isNestedNLevels(node, ruleDepth, false)) {
                    context.report({ node: node, messageId: 'always' });
                } else if (lodashContext.isLodashChainStart(node)) {
                    var firstCall = node.parent.parent;
                    if (isMethodCall(firstCall) && (isEndOfChain(firstCall) || isBeforeChainBreaker(firstCall))) {
                        context.report({ node: firstCall, messageId: 'single' });
                    }
                }
            }
        };

        var visitors = lodashContext.getImportVisitors();
        visitors.CallExpression = callExpressionVisitors[mode];
        return visitors;
    }
};