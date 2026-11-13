# MusicXML 4.0 XSD (test fixture)

- Source: https://github.com/w3c/musicxml, tag `v4.0`, directory `schema/` (`musicxml.xsd`, `xlink.xsd`, `xml.xsd`), fetched 2026-11-13.
- Files are unmodified. License: as stated in `musicxml.xsd` — © 2004-2021 the Contributors to the MusicXML Specification,
  published by the W3C Music Notation Community Group under the W3C Community Final Specification Agreement (FSA).
  `xml.xsd` and `xlink.xsd` carry their own W3C notices.
- `catalog.xml` (ours) maps `http://www.musicxml.org/xsd/` to this folder so `xmllint --nonet` validates offline.
- Used only by tests (P5-05). Not shipped in the app bundle.
