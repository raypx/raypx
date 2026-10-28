use super::*;
use std::io::Cursor;

#[test]
fn startup_query_is_consumed_across_every_split_and_only_once() {
    for split in 0..=CURSOR_QUERY.len() {
        let mut query = CursorQuery::default();
        assert!(query.consume(&CURSOR_QUERY[..split]).is_empty());
        assert!(query.consume(&CURSOR_QUERY[split..]).is_empty());
        assert!(query.complete);
        assert_eq!(query.consume(b"app\x1b[6n"), b"app\x1b[6n");
    }
}

#[test]
fn output_and_other_escape_sequences_are_preserved() {
    let mut query = CursorQuery::default();
    let mut output = Vec::new();
    for byte in b"\x1b[0mhello\x1b\x1b[6nworld\x1b[6n" {
        output.extend(query.consume(&[*byte]));
    }
    assert_eq!(output, b"\x1b[0mhello\x1bworld\x1b[6n");
}

#[test]
fn reader_handshake_does_not_report_false_eof_or_drop_trailing_bytes() {
    for data in [b"\x1b[6noutput".as_slice(), b"partial\x1b["] {
        let (mut reader, startup) = reader(Box::new(Cursor::new(data)));
        let mut output = Vec::new();
        let mut byte = [0u8];
        while reader.read(&mut byte).unwrap() != 0 {
            output.extend(byte);
        }
        if data.starts_with(CURSOR_QUERY) {
            startup.try_recv().unwrap();
            assert_eq!(output, b"output");
        } else {
            assert!(startup.try_recv().is_err());
            assert_eq!(output, data);
        }
    }
}
