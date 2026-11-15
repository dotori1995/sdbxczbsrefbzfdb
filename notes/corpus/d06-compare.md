# D06 엔트리 비교

```text
pnpm exec tsx tools/corpus/compare.ts <before.hwpx> <after.hwpx> Contents/section0.xml
```

허용한 경로 외의 SHA-256이 다르면 종료 코드는 1이다. T01 둘째 문단만 바꾼 fixture에서는 `Contents/section0.xml`만 허용하면 종료 코드가 0이다.
