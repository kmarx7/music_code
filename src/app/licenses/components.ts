export interface Component { name: string; packages?: readonly string[]; version: string; license: "MIT" | "Apache-2.0" | "0BSD" | "OFL-1.1" | "Gonville"; copyright: string; use: string }

/*
 * Software and fonts that ship to the browser (P6-06). Versions from package.json / package-lock on 2026-11-14.
 * Update this list whenever a runtime dependency is added, removed or upgraded.
 */
export const COMPONENTS: Component[] = [
  { name: "Next.js", packages: ["next"], version: "16.4.4", license: "MIT", copyright: "Copyright (c) 2025 Vercel, Inc.", use: "웹 앱 프레임워크" },
  { name: "React · React DOM · scheduler", packages: ["react", "react-dom", "scheduler"], version: "19.3.0 / 0.28.0", license: "MIT", copyright: "Copyright (c) Meta Platforms, Inc. and affiliates.", use: "화면 구성" },
  { name: "styled-jsx", packages: ["styled-jsx"], version: "5.1.6", license: "MIT", copyright: "Copyright (c) 2016-present Vercel, Inc.", use: "Next.js 런타임" },
  { name: "@swc/helpers", packages: ["@swc/helpers"], version: "0.5.23", license: "Apache-2.0", copyright: "© 강동윤 (SWC)", use: "Next.js 런타임 보조 코드" },
  { name: "Tone.js", packages: ["tone"], version: "15.1.22", license: "MIT", copyright: "Copyright (c) 2014-2020 Yotam Mann", use: "악보 재생·메트로놈 소리" },
  { name: "standardized-audio-context", packages: ["standardized-audio-context"], version: "25.3.77", license: "MIT", copyright: "Copyright (c) 2024 Christoph Guttandin", use: "Tone.js 오디오 호환 계층" },
  { name: "automation-events", packages: ["automation-events"], version: "7.1.19", license: "MIT", copyright: "Copyright (c) 2026 Christoph Guttandin", use: "Tone.js 오디오 호환 계층" },
  { name: "@babel/runtime", packages: ["@babel/runtime"], version: "7.29.13", license: "MIT", copyright: "Copyright (c) 2014-present Sebastian McKenzie and other contributors", use: "오디오 계층 보조 코드" },
  { name: "tslib", packages: ["tslib"], version: "2.9.1", license: "0BSD", copyright: "Copyright (c) Microsoft Corporation.", use: "Tone.js 보조 코드" },
  { name: "VexFlow", packages: ["vexflow"], version: "5.0.0", license: "MIT", copyright: "Copyright (c) 2023-present VexFlow contributors; Copyright (c) 2010-2022 Mohit Muthanna Cheppudira", use: "악보 그리기" },
  { name: "Bravura (악보 기호 글꼴)", version: "VexFlow 5.0.0 내장", license: "OFL-1.1", copyright: "Copyright © 2019, Steinberg Media Technologies GmbH, with Reserved Font Name \"Bravura\".", use: "VexFlow에 포함된 글꼴" },
  { name: "Academico (글꼴)", version: "VexFlow 5.0.0 내장", license: "OFL-1.1", copyright: "Copyright © 2022, Steinberg Media Technologies GmbH, with Reserved Font Name \"Academico\".", use: "VexFlow에 포함된 글꼴" },
  { name: "Petaluma · Petaluma Script (글꼴)", version: "VexFlow 5.0.0 내장", license: "OFL-1.1", copyright: "Copyright © 2018, Steinberg Media Technologies GmbH, with Reserved Font Name \"Petaluma\".", use: "VexFlow에 포함된 글꼴" },
  { name: "Gonville (악보 기호 글꼴)", version: "VexFlow 5.0.0 내장", license: "Gonville", copyright: "Simon Tatham (글꼴 파일은 사용 제한 없음, 원본 코드는 © 2009 Simon Tatham)", use: "VexFlow에 포함된 글꼴" },
];
