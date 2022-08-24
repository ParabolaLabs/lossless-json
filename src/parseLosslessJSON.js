'use strict'

import { resolveCircularReferences } from './circular.js'
import { config } from './config.js'
import { LosslessNumber } from './LosslessNumber.js'
import { revive } from './revive.js'

/**
 * The LosslessJSON.parse() method parses a string as JSON, optionally transforming
 * the value produced by parsing.
 *
 * The parser is based on the parser of Tan Li Hou shared in
 * https://lihautan.com/json-parser-with-javascript/
 *
 * @param {string} text
 * The string to parse as JSON. See the JSON object for a description of JSON syntax.
 *
 * @param {function(key: string, value: *)} [reviver]
 * If a function, prescribes how the value originally produced by parsing is
 * transformed, before being returned.
 *
 * @returns Returns the Object corresponding to the given JSON text.
 *
 * @throws Throws a SyntaxError exception if the string to parse is not valid JSON.
 */
export function parseLosslessJSON(text, reviver = undefined) {
  let i = 0

  let value = parseValue()
  expectEndOfInput()

  // TODO: create a plugin system
  if (reviver) {
    value = revive(value, reviver)
  }
  if (config().circularRefs) {
    value = resolveCircularReferences(value)
  }
  return value

  function parseObject() {
    if (text[i] === "{") {
      i++
      skipWhitespace()

      const object = {}
      let initial = true
      while (i < text.length && text[i] !== "}") {
        if (!initial) {
          eatComma()
          skipWhitespace()
        } else {
          initial = false
        }

        const key = parseString()
        if (key === undefined) {
          expectObjectKey()
        }
        skipWhitespace()
        eatColon()
        object[key] = parseValue()
      }
      expectNotEndOfInput("}")
      // move to the next character of '}'
      i++

      return object
    }
  }

  function parseArray() {
    if (text[i] === "[") {
      i++
      skipWhitespace()

      const array = []
      let initial = true
      while (i < text.length && text[i] !== "]") {
        if (!initial) {
          eatComma()
        } else {
          initial = false
        }

        const value = parseValue()
        array.push(value)
      }
      expectNotEndOfInput("]")
      i++

      return array
    }
  }

  function parseValue() {
    skipWhitespace()

    const value =
      parseString() ??
      parseNumber() ??
      parseObject() ??
      parseArray() ??
      parseKeyword("true", true) ??
      parseKeyword("false", false) ??
      parseKeyword("null", null)

    skipWhitespace()

    return value
  }

  function parseKeyword(name, value) {
    if (text.slice(i, i + name.length) === name) {
      i += name.length
      return value
    }
  }

  function skipWhitespace() {
    while (isWhitespace(text[i])) {
      i++
    }
  }

  function parseString() {
    if (text[i] === '"') {
      i++
      let result = ""
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") {
          const char = text[i + 1]
          const escapeChar = escapeCharacters[char]
          if (escapeChar !== undefined) {
            result += escapeChar
            i++
          } else if (char === "u") {
            if (
              isHex(text[i + 2]) &&
              isHex(text[i + 3]) &&
              isHex(text[i + 4]) &&
              isHex(text[i + 5])
            ) {
              result += String.fromCharCode(
                parseInt(text.slice(i + 2, i + 6), 16)
              )
              i += 5
            } else {
              i += 2
              expectEscapeUnicode(result)
            }
          } else {
            expectEscapeCharacter(result)
          }
        } else {
          result += text[i]
        }
        i++
      }
      expectNotEndOfInput('"')
      i++
      return result
    }
  }

  function parseNumber() {
    let start = i
    if (text[i] === "-") {
      i++
      expectDigit(start)
    }

    if (text[i] === "0") {
      i++
    } else if (isNonZeroDigit(text[i])) {
      i++
      while (isDigit(text[i])) {
        i++
      }
    }

    if (text[i] === ".") {
      i++
      expectDigit(start)
      while (isDigit(text[i])) {
        i++
      }
    }

    if (text[i] === "e" || text[i] === "E") {
      i++
      if (text[i] === "-" || text[i] === "+") {
        i++
      }
      expectDigit(start)
      while (isDigit(text[i])) {
        i++
      }
    }

    if (i > start) {
      return new LosslessNumber(text.slice(start, i))
    }
  }

  function eatComma() {
    expectCharacter(",")
    i++
  }

  function eatColon() {
    expectCharacter(":")
    i++
  }

  // error handling
  function expectNotEndOfInput(expected) {
    if (i === text.length) {
      printCodeSnippet(`Expecting a \`${expected}\` here`)
      throw new Error("JSON_ERROR_0001 Unexpected End of Input")
    }
  }

  function expectEndOfInput() {
    if (i < text.length) {
      printCodeSnippet("Expecting to end here")
      throw new Error("JSON_ERROR_0002 Expected End of Input")
    }
  }

  function expectObjectKey() {
    printCodeSnippet(`Expecting object key here

For example:
{ "foo": "bar" }
  ^^^^^`)
    throw new Error("JSON_ERROR_0003 Expecting JSON Key")
  }

  function expectCharacter(expected) {
    if (text[i] !== expected) {
      printCodeSnippet(`Expecting a \`${expected}\` here`)
      throw new Error("JSON_ERROR_0004 Unexpected token")
    }
  }

  function expectDigit(start) {
    const numSoFar = text.slice(start, i)
    if (!(text[i] >= "0" && text[i] <= "9")) {
      printCodeSnippet(`JSON_ERROR_0005 Expecting a digit here

For example:
${numSoFar}5
${" ".repeat(numSoFar.length)}^`)
      throw new Error("JSON_ERROR_0006 Expecting a digit")
    }
  }

  function expectEscapeCharacter(strSoFar) {
    printCodeSnippet(`JSON_ERROR_0007 Expecting escape character

For example:
"${strSoFar}\\n"
${" ".repeat(strSoFar.length + 1)}^^
List of escape characters are: \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, \\u`)
    throw new Error("JSON_ERROR_0008 Expecting an escape character")
  }

  function expectEscapeUnicode(strSoFar) {
    printCodeSnippet(`Expect escape unicode

For example:
"${strSoFar}\\u0123
${" ".repeat(strSoFar.length + 1)}^^^^^^`)
    throw new Error("JSON_ERROR_0009 Expecting an escape unicode")
  }

  function printCodeSnippet(message) {
    const from = Math.max(0, i - 10)
    const trimmed = from > 0
    const padding = (trimmed ? 4 : 0) + (i - from)
    const snippet = [
      (trimmed ? "... " : "") + text.slice(from, i + 1),
      " ".repeat(padding) + "^",
      " ".repeat(padding) + message
    ].join("\n")
    console.log(snippet)
  }
}

function isWhitespace(char) {
  return whitespaceCharacters[char] === true
}

function isHex(char) {
  return /^[0-9a-fA-F]/.test(char)
}

function isDigit (char) {
  return /[0-9]/.test(char)
}

function isNonZeroDigit (char) {
  return /[1-9]/.test(char)
}


// map with all escape characters
const escapeCharacters = {
  '\"': '\"',
  '\\': '\\',
  '/': '/',
  'b': '\b',
  'f': '\f',
  'n': '\n',
  'r': '\r',
  't': '\t'
  // \u is handled by getToken()
};

// map with all whitespace characters
const whitespaceCharacters = {
  ' ': true,
  '\n': true,
  '\t': true,
  '\r': true
};
