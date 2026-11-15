import { strToU8, zipSync } from 'fflate'

export const T01_FIRST = '첫번째 문단이다.'
export const T01_SECOND = '두번째 문단이다.'

const HANCOM_2011 = 'http://www.hancom.co.kr/hwpml/2011'

export const T01_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="${HANCOM_2011}/head" version="1.5" secCnt="1">
  <hh:refList>
    <hh:fontfaces itemCnt="1">
      <hh:fontface lang="HANGUL" fontCnt="1">
        <hh:font id="0" face="맑은 고딕"/>
      </hh:fontface>
    </hh:fontfaces>
    <hh:charProperties itemCnt="1">
      <hh:charPr id="0" height="1000" textColor="#000000">
        <hh:fontRef hangul="0"/>
      </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties itemCnt="1">
      <hh:paraPr id="0">
        <hh:align horizontal="JUSTIFY"/>
      </hh:paraPr>
    </hh:paraProperties>
  </hh:refList>
</hh:head>
`

export function sectionXml(sectionNs: string, paragraphNs: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="${sectionNs}" xmlns:hp="${paragraphNs}">
${body}
</hs:sec>
`
}

export function t01SectionXml(
  sectionNs = `${HANCOM_2011}/section`,
  paragraphNs = `${HANCOM_2011}/paragraph`,
): string {
  return sectionXml(
    sectionNs,
    paragraphNs,
    `  <hp:p id="100" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:t>${T01_FIRST}</hp:t></hp:run>
  </hp:p>
  <hp:p id="200" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:t>${T01_SECOND}</hp:t></hp:run>
  </hp:p>`,
  )
}

export function buildHwpx(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/hwp+zip'), { level: 0 }],
  }
  for (const [name, xml] of Object.entries(files)) {
    entries[name] = strToU8(xml)
  }
  return zipSync(entries)
}

export const T02_BOLD = '굵은글'
export const T02_PLAIN = '보통글'

export function t02SectionXml(
  sectionNs = `${HANCOM_2011}/section`,
  paragraphNs = `${HANCOM_2011}/paragraph`,
): string {
  return sectionXml(
    sectionNs,
    paragraphNs,
    `  <hp:p id="300" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:secPr/></hp:run>
    <hp:run charPrIDRef="1"><hp:t>${T02_BOLD}</hp:t></hp:run>
    <hp:run charPrIDRef="0"><hp:ctrl/></hp:run>
    <hp:run charPrIDRef="0"><hp:t>${T02_PLAIN}</hp:t></hp:run>
  </hp:p>`,
  )
}

export function buildT02Fixture(section = t02SectionXml()): Uint8Array {
  return buildHwpx({
    'Contents/header.xml': T01_HEADER,
    'Contents/section0.xml': section,
  })
}

export function buildT01Fixture(section = t01SectionXml()): Uint8Array {
  return buildHwpx({
    'Contents/header.xml': T01_HEADER,
    'Contents/section0.xml': section,
  })
}
