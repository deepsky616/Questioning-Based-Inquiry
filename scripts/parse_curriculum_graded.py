"""
2022 개정 초등 교육과정 docx → 학년군별 내용요소 분리 파서
- Word 테이블의 vMerge/gridSpan 처리
- 출력: subject/area별로 {"1-2": {...}, "3-4": {...}, "5-6": {...}, "middle": {...}} 구조
"""
import zipfile
import xml.etree.ElementTree as ET
import json
import re

DOCX = "/Users/youngmini/Downloads/2022 개정 초등학교교육과정_핵심아이디어,성취기준,내용요.docx"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

SUBJECTS_KO = ["국어", "수학", "도덕", "과학", "사회", "실과", "음악", "미술", "체육", "영어"]
GRADE_KEYS = ["1-2", "3-4", "5-6", "middle"]

# 학년군 헤더 행 판별: "1∼2학년", "3~4학년군", "3-4학년군", "1~3학년" 등
# 하이픈(-) / 물결(∼~) 모두 허용; "중학교"/"초등학교" 단독 행은 제외
GRADE_HEADER_PAT = re.compile(r"[135][∼~-][2-6]학년")

# ── 헬퍼 ──────────────────────────────────────────────────────────────────────
def get_text(el):
    return "".join(t.text or "" for t in el.findall(".//w:t", NS)).strip()

def normalize(text):
    """⋅ · 표준화, 공백 정리"""
    return re.sub(r"[⋅·•]", "·", text).strip()

def split_bullets(text):
    """· 기준으로 항목 분리 후 정제"""
    text = normalize(text)
    items = re.split(r"·", text)
    cleaned = []
    for item in items:
        item = item.strip()
        if item and len(item) > 1 and not re.match(r"^[\s\d]+$", item):
            cleaned.append(item)
    return cleaned

def get_grid_span(tc):
    gs = tc.find(".//w:gridSpan", NS)
    if gs is not None:
        return int(gs.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val", 1))
    return 1

def is_vmerge_continue(tc):
    vm = tc.find(".//w:vMerge", NS)
    if vm is None:
        return False
    val = vm.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val", "")
    return val != "restart"

def expand_row(row, num_cols):
    """셀을 논리 컬럼 배열로 확장 (vMerge 연속 셀 = None, gridSpan > 1 = 여러 슬롯)"""
    logical = []
    for tc in row.findall("w:tc", NS):
        span = get_grid_span(tc)
        if is_vmerge_continue(tc):
            logical.extend([None] * span)
        else:
            text = get_text(tc)
            logical.append(text)
            logical.extend([None] * (span - 1))
    while len(logical) < num_cols:
        logical.append(None)
    return logical[:num_cols]

def detect_num_cols(tbl):
    """테이블의 최대 논리 컬럼 수"""
    num_cols = 0
    for row in tbl.findall("w:tr", NS):
        cols = sum(get_grid_span(tc) for tc in row.findall("w:tc", NS))
        num_cols = max(num_cols, cols)
    return num_cols

def parse_content_table(tbl):
    """
    내용요소 테이블 → grade → {knowledge, process, value} 딕셔너리.
    학년군 컬럼이 없는 테이블은 None 반환.
    """
    rows = tbl.findall("w:tr", NS)
    if not rows:
        return None

    num_cols = detect_num_cols(tbl)
    if num_cols < 3:
        return None

    # 학년군 헤더 행 찾기 (1∼2, 3∼4, 5∼6, 중학교 등 모두 허용)
    grade_col_map = {}
    grade_row_idx = None
    for ri, row in enumerate(rows):
        logical = expand_row(row, num_cols)
        joined = " ".join(c or "" for c in logical)
        if GRADE_HEADER_PAT.search(joined):
            grade_row_idx = ri
            for ci, cell in enumerate(logical):
                if not cell:
                    continue
                if re.search(r"1[∼~-]2", cell):
                    grade_col_map[ci] = "1-2"
                elif re.search(r"3[∼~-]4", cell):
                    grade_col_map[ci] = "3-4"
                elif re.search(r"5[∼~-]6", cell):
                    grade_col_map[ci] = "5-6"
                elif re.search(r"1[∼~-]3", cell) or "중학교" in cell:
                    grade_col_map[ci] = "middle"
            break

    if not grade_col_map or len(grade_col_map) < 2:
        return None

    result = {g: {"knowledge": [], "process": [], "value": []} for g in GRADE_KEYS}
    current_cat = None
    prev_logical = [""] * num_cols

    for ri, row in enumerate(rows):
        if grade_row_idx is not None and ri <= grade_row_idx:
            continue

        logical = expand_row(row, num_cols)
        # vMerge 이어받기
        for ci in range(num_cols):
            if logical[ci] is None:
                logical[ci] = prev_logical[ci]

        # 카테고리 결정 (column 0)
        cat_text = normalize(logical[0] or "")
        if "지식" in cat_text:
            current_cat = "knowledge"
        elif "과정" in cat_text:
            current_cat = "process"
        elif "가치" in cat_text:
            current_cat = "value"

        if current_cat is None:
            prev_logical = logical
            continue

        for ci, grade in grade_col_map.items():
            if ci >= len(logical):
                continue
            cell_text = logical[ci] or ""
            items = split_bullets(cell_text)
            for item in items:
                if item not in result[grade][current_cat]:
                    result[grade][current_cat].append(item)

        prev_logical = logical

    # 최소한 어느 학년에 내용이 있어야 유효
    has_content = any(
        bool(result[g][cat])
        for g in GRADE_KEYS
        for cat in ["knowledge", "process", "value"]
    )
    return result if has_content else None


def merge_parsed(dest, src):
    """parse_content_table 결과를 dest 딕셔너리에 합치기"""
    for grade in GRADE_KEYS:
        for cat in ["knowledge", "process", "value"]:
            existing = dest[grade][cat]
            for item in src[grade][cat]:
                if item not in existing:
                    existing.append(item)


def empty_grade_dict():
    return {g: {"knowledge": [], "process": [], "value": []} for g in GRADE_KEYS}


def main():
    with zipfile.ZipFile(DOCX) as z:
        xml_content = z.read("word/document.xml")

    root = ET.fromstring(xml_content)
    body = root.find(".//w:body", NS)

    all_data = {}  # {subject: {area: {grade: {cat: [items]}}}}
    current_subject = None
    current_area = None
    in_content_section = True  # "나. 성취기준" 이후는 건너뜀
    # 영역 라벨 전에 먼저 등장한 테이블(사회 지리 인식 등)을 임시 보관
    pending_table = None

    for el in body:
        tag = el.tag.split("}")[-1]

        if tag == "p":
            text = get_text(el).strip()

            # 교과 감지 (단독 교과명)
            if text in SUBJECTS_KO:
                current_subject = text
                current_area = None
                in_content_section = True
                pending_table = None
                continue

            # "나. 성취기준" 이후는 내용체계 아님 → 건너뜀
            if re.match(r"^나[.．]\s*성취기준", text):
                in_content_section = False
                pending_table = None
            elif re.match(r"^가[.．]\s*내용\s*체계", text):
                in_content_section = True

            # 영역 감지: "(1) 듣기·말하기" 형태
            if in_content_section and current_subject:
                area_match = re.match(r"^\(\d+\)\s+(.+)$", text)
                if area_match:
                    area_raw = area_match.group(1).strip()
                    current_area = normalize(area_raw)
                    # 이 영역보다 먼저 등장한 테이블이 있으면 지금 영역에 귀속
                    if pending_table:
                        all_data.setdefault(current_subject, {})
                        all_data[current_subject].setdefault(current_area, empty_grade_dict())
                        merge_parsed(all_data[current_subject][current_area], pending_table)
                        pending_table = None

        elif tag == "tbl" and current_subject and in_content_section:
            parsed = parse_content_table(el)
            if parsed:
                if current_area:
                    all_data.setdefault(current_subject, {})
                    all_data[current_subject].setdefault(current_area, empty_grade_dict())
                    merge_parsed(all_data[current_subject][current_area], parsed)
                else:
                    # 영역 라벨 전에 등장한 테이블 — 다음 영역에 귀속될 예정
                    pending_table = parsed

    print(json.dumps(all_data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
