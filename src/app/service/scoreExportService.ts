import ExcelJS from "exceljs";
import { HttpError } from "../utils/http";
import { fetchRanking, fetchWeekPointDetails, RankingPeriod } from "./scoreService";
import { checkBranchExist } from "./branchService";
import { checkGradeExist } from "./gradeService";

// Xuất bảng điểm thi đua ra file Excel (.xlsx) theo tuần / tháng / học kỳ / cả năm học
// Số liệu lấy từ fetchRanking (cùng số liệu với GET /scores/ranking): chỉ tính tuần đã bắt đầu, rank theo tổng
// Riêng file tuần có thêm điểm gốc từng phần và cột "Chi tiết cộng / trừ" (mỗi lượt 1 dòng, không kèm học sinh)

const formatDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

const nowText = () => new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date());

// Phần tên file theo khoảng, chỉ ký tự ASCII để header Content-Disposition không lỗi
const periodSlug = (period: RankingPeriod) =>
    period.type === 'week' ? `tuan-${period.value}`
        : period.type === 'month' ? `thang-${period.value}`
            : period.type === 'semester' ? `hoc-ky-${period.value}`
                : 'ca-nam';

const formatValue = (value: number) => value > 0 ? `+${value}` : `${value}`;

type Column = { header: string, group?: string, width: number, value: (row: any) => any, wrap?: boolean };

const BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
};
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };

export const buildScoreWorkbook = async (schoolyearid: number, period: RankingPeriod, filter: { branchid?: number, gradeid?: number } = {}) => {
    const scopeParts: string[] = [];
    const fileScope: string[] = [];
    if (filter.branchid !== undefined) {
        const branch = await checkBranchExist(filter.branchid);
        if (!branch) throw new HttpError(404, 'Không tìm thấy phân hiệu');
        scopeParts.push(branch.name);
        fileScope.push(`phan-hieu-${branch.code}`);
    }
    if (filter.gradeid !== undefined) {
        const grade = await checkGradeExist(filter.gradeid);
        if (!grade) throw new HttpError(404, 'Không tìm thấy khối');
        scopeParts.push(`Khối ${grade.numgrade}`);
        fileScope.push(`khoi-${grade.numgrade}`);
    }

    const ranking = await fetchRanking(schoolyearid, period, filter);
    const { schoolyear, period: info, scores } = ranking;
    const isWeek = period.type === 'week';
    const details = isWeek ? await fetchWeekPointDetails(info.weekids[0]) : new Map();

    const columns: Column[] = [
        { header: 'Hạng', width: 7, value: (r) => r.rank },
        { header: 'Lớp', width: 8, value: (r) => r.classname },
        { header: 'GVCN', width: 24, value: (r) => r.teachername ?? '' },
    ];
    if (isWeek) {
        // Điểm gốc của tuần = điểm phần - cộng + trừ
        columns.push(
            { header: 'Điểm gốc', group: 'Nề nếp', width: 9, value: (r) => r.conduct_score - r.conduct_plus + r.conduct_minus },
            { header: 'Cộng', group: 'Nề nếp', width: 8, value: (r) => r.conduct_plus },
            { header: 'Trừ', group: 'Nề nếp', width: 8, value: (r) => -r.conduct_minus },
            { header: 'Điểm', group: 'Nề nếp', width: 8, value: (r) => r.conduct_score },
            { header: 'Điểm gốc', group: 'Học tập', width: 9, value: (r) => r.study_score - r.study_plus + r.study_minus },
            { header: 'Cộng', group: 'Học tập', width: 8, value: (r) => r.study_plus },
            { header: 'Trừ', group: 'Học tập', width: 8, value: (r) => -r.study_minus },
            { header: 'Điểm', group: 'Học tập', width: 8, value: (r) => r.study_score },
            { header: 'Tổng điểm', width: 10, value: (r) => r.total },
            { header: 'Số lượt', width: 8, value: (r) => r.entries },
            {
                header: 'Chi tiết cộng / trừ', width: 60, wrap: true,
                value: (r) => (details.get(r.classid) ?? [])
                    .map((p: any) => `[${p.type}] ${p.content}: ${formatValue(p.value)}`)
                    .join('\n'),
            },
        );
    } else {
        columns.push(
            { header: 'Số tuần', width: 8, value: (r) => r.weeks },
            { header: 'Cộng', group: 'Nề nếp', width: 8, value: (r) => r.conduct_plus },
            { header: 'Trừ', group: 'Nề nếp', width: 8, value: (r) => -r.conduct_minus },
            { header: 'Điểm', group: 'Nề nếp', width: 9, value: (r) => r.conduct_score },
            { header: 'Cộng', group: 'Học tập', width: 8, value: (r) => r.study_plus },
            { header: 'Trừ', group: 'Học tập', width: 8, value: (r) => -r.study_minus },
            { header: 'Điểm', group: 'Học tập', width: 9, value: (r) => r.study_score },
            { header: 'Tổng điểm', width: 10, value: (r) => r.total },
            { header: 'TB / tuần', width: 9, value: (r) => r.avg_total },
            { header: 'Số lượt', width: 8, value: (r) => r.entries },
        );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Quản lý thi đua';
    workbook.created = new Date();
    // Tên sheet tối đa 31 ký tự, không chứa * ? : \ / [ ] (vd "Tháng 10/2026" → "Tháng 10-2026")
    const sheet = workbook.addWorksheet(info.label.replace(/[*?:\\/\[\]]/g, '-').slice(0, 31), {
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.columns = columns.map((c) => ({ width: c.width }));
    const lastCol = columns.length;

    // Dòng 1-3: tiêu đề, năm học + khoảng thời gian + phạm vi, ghi chú
    const title = isWeek ? `BẢNG ĐIỂM THI ĐUA ${info.label.toUpperCase()}` : `TỔNG HỢP ĐIỂM THI ĐUA ${info.label.toUpperCase()}`;
    const subtitle = [
        `Năm học ${schoolyear.name}`,
        `Từ ${formatDate(info.startdate)} đến ${formatDate(info.enddate)}`,
        ...(scopeParts.length > 0 ? scopeParts : ['Toàn trường']),
    ].join(' · ');
    const note = [
        ...(info.countedweeks < info.numweeks ? [`Tính ${info.countedweeks}/${info.numweeks} tuần đã bắt đầu`] : []),
        `Xuất lúc ${nowText()}`,
    ].join(' · ');
    [[title, 14, true], [subtitle, 11, false], [note, 10, false]].forEach(([text, size, bold], i) => {
        const row = i + 1;
        sheet.mergeCells(row, 1, row, lastCol);
        const cell = sheet.getCell(row, 1);
        cell.value = text as string;
        cell.font = { size: size as number, bold: bold as boolean, italic: i === 2 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.getRow(1).height = 22;

    // Dòng 5-6: header 2 tầng (nhóm Nề nếp / Học tập), cột không có nhóm gộp dọc 2 dòng
    const headerTop = 5;
    const headerBottom = 6;
    let col = 1;
    while (col <= lastCol) {
        const c = columns[col - 1];
        if (!c.group) {
            sheet.mergeCells(headerTop, col, headerBottom, col);
            sheet.getCell(headerTop, col).value = c.header;
            col++;
            continue;
        }
        let end = col;
        while (end < lastCol && columns[end].group === c.group) end++;
        sheet.mergeCells(headerTop, col, headerTop, end);
        sheet.getCell(headerTop, col).value = c.group;
        for (let i = col; i <= end; i++) sheet.getCell(headerBottom, i).value = columns[i - 1].header;
        col = end + 1;
    }
    for (const r of [headerTop, headerBottom]) {
        for (let i = 1; i <= lastCol; i++) {
            const cell = sheet.getCell(r, i);
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.fill = HEADER_FILL;
            cell.border = BORDER;
        }
    }

    // Dữ liệu, sắp theo hạng
    scores.forEach((score: any, index: number) => {
        const row = sheet.getRow(headerBottom + 1 + index);
        columns.forEach((c, i) => {
            const cell = row.getCell(i + 1);
            cell.value = c.value(score);
            cell.border = BORDER;
            cell.alignment = c.wrap
                ? { vertical: 'top', wrapText: true }
                : { vertical: 'top', horizontal: i === 2 ? 'left' : 'center' };
        });
        const total = columns.findIndex((c) => c.header === 'Tổng điểm') + 1;
        row.getCell(total).font = { bold: true };
    });

    sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: headerBottom }];
    sheet.pageSetup.printTitlesRow = `${headerTop}:${headerBottom}`;

    const filename = ['diem-thi-dua', schoolyear.name, periodSlug(period), ...fileScope].join('_') + '.xlsx';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { filename, buffer };
}
