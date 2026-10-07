/**
 * 현재 보이는 보드를 PNG로 저장 (기획서 4절 "내보내기: 디스코드 공유용").
 *
 * 방식: SVG를 복제 → 배경 <image>를 data URL로 인라인(캔버스 오염 방지) → 직렬화 → <img>로 읽어 캔버스에 그린 뒤 다운로드.
 * 글꼴은 시스템에 설치된 것으로 대체될 수 있다(SVG 안에 글꼴을 포함하지 않는다).
 */
export async function exportBoardPng(svg: SVGSVGElement, fileName: string, size = 1600): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  clone.style.background = "#0a1017";

  for (const img of Array.from(clone.querySelectorAll("image"))) {
    const href = img.getAttribute("href");
    if (!href || href.startsWith("data:")) continue;
    try {
      const res = await fetch(href);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      img.setAttribute("href", dataUrl);
    } catch {
      img.remove(); // 배경을 못 읽으면 객체만이라도 내보낸다
    }
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("SVG 렌더링에 실패했습니다"));
      el.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 만들 수 없습니다");
    ctx.fillStyle = "#0a1017";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG 변환에 실패했습니다");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(/[\\/:*?"<>|]/g, "_");
    // 문서에 붙어 있지 않은 앵커는 브라우저가 download 속성을 무시할 수 있어 잠깐 붙였다 뗀다
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
