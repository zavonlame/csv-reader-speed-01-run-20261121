// fast-csv: a hand-written single-pass CSV reader that answers exactly like
// csv-reader 1.0.0, but without its per-character string building. The
// reference reads one character at a time and grows every field a character
// at a time; this one jumps between the characters that steer it and cuts
// each field out of the text in one slice, so a plain line costs a native
// split and a quoted field costs a native search for its closing quote.
//
// The policy it reproduces, character for character:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside it is
//     read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character, and the text after it
//     is read again as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on, row its record's index in rows (null for the header), in the
//     order met.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next.

// The four characters that steer the parser, as byte codes.
const COMMA = 44; // ,
const LF = 10; // \n
const CR = 13; // \r
const QUOTE = 34; // "

// How a field ended: at a comma, at a line break, or at the end of the text.
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on, and its index in rows (null for the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read, kept in shared slots so the hot readers allocate
  // nothing per field.
  let fieldValue = '';
  let fieldEnded = AT_END;
  let fieldAdded = 0;

  function fail(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, appending onto `start`. A CR
  // not followed by LF is dropped and reported; the field ends at a comma,
  // a line break or the end of the text. The kept characters are cut out in
  // slices, never grown one character at a time.
  function readPlain(start) {
    let value = start;
    let added = 0;
    let from = pos;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === COMMA) {
        if (from < pos) {
          value += text.slice(from, pos);
          added += pos - from;
        }
        pos += 1;
        fieldValue = value;
        fieldEnded = AT_COMMA;
        fieldAdded = added;
        return;
      }
      if (c === LF) {
        if (from < pos) {
          value += text.slice(from, pos);
          added += pos - from;
        }
        pos += 1;
        line += 1;
        fieldValue = value;
        fieldEnded = AT_BREAK;
        fieldAdded = added;
        return;
      }
      if (c === CR) {
        if (pos + 1 < n && text.charCodeAt(pos + 1) === LF) {
          if (from < pos) {
            value += text.slice(from, pos);
            added += pos - from;
          }
          pos += 2;
          line += 1;
          fieldValue = value;
          fieldEnded = AT_BREAK;
          fieldAdded = added;
          return;
        }
        // A lone CR is dropped and reported, and the field goes on.
        if (from < pos) {
          value += text.slice(from, pos);
          added += pos - from;
        }
        fail('stray_cr');
        pos += 1;
        from = pos;
        continue;
      }
      pos += 1;
    }
    if (from < pos) {
      value += text.slice(from, pos);
      added += pos - from;
    }
    fieldValue = value;
    fieldEnded = AT_END;
    fieldAdded = added;
  }

  // Reads a quoted field whose opening quote is at pos. Each run between
  // quotes is one slice; only a run that hides a line break is walked
  // character by character, to count its lines and turn its CRs into LFs.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    while (pos < n) {
      // Jump straight to the next quote.
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        fail('unterminated_quote');
        readPlain('"');
        return;
      }
      if (q > pos) {
        const run = text.slice(pos, q);
        if (run.indexOf('\n') === -1 && run.indexOf('\r') === -1) {
          value += run;
        } else {
          let s = 0;
          for (let i = 0; i < run.length; i += 1) {
            const c = run.charCodeAt(i);
            if (c === CR) {
              value += run.slice(s, i);
              value += '\n';
              line += 1;
              if (i + 1 < run.length && run.charCodeAt(i + 1) === LF) i += 1;
              s = i + 1;
            } else if (c === LF) {
              line += 1;
            }
          }
          value += run.slice(s);
        }
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === QUOTE) {
        // A doubled quote is one literal quote inside the field.
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      if (pos >= n) {
        fieldValue = value;
        fieldEnded = AT_END;
        fieldAdded = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === COMMA) {
        pos += 1;
        fieldValue = value;
        fieldEnded = AT_COMMA;
        fieldAdded = 0;
        return;
      }
      if (c === LF) {
        pos += 1;
        line += 1;
        fieldValue = value;
        fieldEnded = AT_BREAK;
        fieldAdded = 0;
        return;
      }
      if (c === CR && pos + 1 < n && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
        fieldValue = value;
        fieldEnded = AT_BREAK;
        fieldAdded = 0;
        return;
      }
      // Anything else is appended as it stands, up to the next comma or break.
      readPlain(value);
      if (fieldAdded > 0) fail('quote_junk');
      return;
    }
    // Ran out of text without a closing quote.
    pos = open + 1;
    line = openLine;
    fail('unterminated_quote');
    readPlain('"');
  }

  // Settles the record just read: a line that held only stray CRs is left
  // with no characters and is no record; the first record sets the width
  // (and becomes the header when asked); later records are padded with ""
  // or cut to it, and the shortfall or the cut is reported.
  function finish(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && pos + 1 < n && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast lane: a line with no quote and no stray CR is one slice split on commas.
    // (An empty line never reaches here: the skip loop above already ate it.)
    const nl = text.indexOf('\n', pos);
    if (nl !== -1) {
      const end = nl > pos && text.charCodeAt(nl - 1) === CR ? nl - 1 : nl;
      if (end > pos) {
        const span = text.slice(pos, end);
        // One native test for either steering character, instead of two scans.
        if (!/["\r]/.test(span)) {
          finish(span.split(','), false);
          pos = nl + 1;
          line += 1;
          continue;
        }
      }
    } else {
      // The tail: no line break left in the text.
      const tail = text.slice(pos);
      if (!/["\r]/.test(tail)) {
        finish(tail.split(','), false);
        pos = n;
        continue;
      }
    }

    // Slow lane: the record holds a quote or a stray CR, so read it field by field.
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === QUOTE;
      if (quoted) readQuoted();
      else readPlain('');
      fields.push(fieldValue);
    } while (fieldEnded === AT_COMMA);
    finish(fields, quoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
