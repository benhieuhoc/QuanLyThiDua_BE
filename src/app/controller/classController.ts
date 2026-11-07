import { sendSuccess, sendError, handleError, parseId } from "../utils/http";
import { getAllClass, getClassById, batchCreateClass, updateClassTeacher, deleteClass } from "../service/classService";
import { fetchAssignedClassIds } from "../service/accountService";
import { fetchAllStudent } from "../service/studentService";

// Query: ?branchid=&gradeid= (không bắt buộc)
export const getClasses = async (req: any, res: any) => {
    try {
        const filter: { branchid?: number, gradeid?: number } = {};
        for (const key of ['branchid', 'gradeid'] as const) {
            if (req.query[key] !== undefined) {
                const value = parseId(req.query[key]);
                if (!value) return sendError(res, 400, `${key} không hợp lệ`);
                filter[key] = value;
            }
        }
        return sendSuccess(res, await getAllClass(filter));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getClass = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const cls = await getClassById(id);
        if (!cls) return sendError(res, 404, 'Không tìm thấy lớp');
        // Cờ đỏ chỉ thấy danh sách học sinh của lớp được phân công, lớp khác trả students: []
        const hideStudents = req.user.kind === 'codo' && !(await fetchAssignedClassIds(req.user.id)).includes(id);
        return sendSuccess(res, { ...cls, students: hideStudents ? [] : await fetchAllStudent({ classid: id }) });
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { gradeid, branchid, teacherIds: (number | null)[] } — mỗi phần tử là GVCN của 1 lớp mới, null = chưa phân công
export const postClasses = async (req: any, res: any) => {
    try {
        const gradeid = parseId(req.body?.gradeid);
        const branchid = parseId(req.body?.branchid);
        const rawIds = req.body?.teacherIds;
        const errors: any[] = [];
        if (!gradeid) errors.push({ field: 'gradeid', message: 'gradeid không hợp lệ' });
        if (!branchid) errors.push({ field: 'branchid', message: 'branchid không hợp lệ' });

        let teacherIds: (number | null)[] = [];
        if (!Array.isArray(rawIds) || rawIds.length === 0) {
            errors.push({ field: 'teacherIds', message: 'teacherIds phải là mảng không rỗng' });
        } else {
            teacherIds = rawIds.map((id: any) => id === null ? null : parseId(id) ?? 0);
            const assigned = teacherIds.filter((id) => id !== null);
            if (assigned.some((id) => !id)) {
                errors.push({ field: 'teacherIds', message: 'teacherIds chứa id không hợp lệ' });
            } else if (new Set(assigned).size !== assigned.length) {
                errors.push({ field: 'teacherIds', message: 'teacherIds bị trùng' });
            }
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const classes = await batchCreateClass(gradeid!, branchid!, teacherIds);
        return sendSuccess(res, classes, 'Tạo lớp thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { teacherid } — đổi giáo viên chủ nhiệm, null để bỏ phân công
export const putClass = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const teacherid = req.body?.teacherid === null ? null : parseId(req.body?.teacherid);
        if (teacherid === null && req.body?.teacherid !== null) return sendError(res, 400, 'Dữ liệu không hợp lệ', [{ field: 'teacherid', message: 'teacherid không hợp lệ' }]);
        return sendSuccess(res, await updateClassTeacher(id, teacherid), 'Cập nhật lớp thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeClass = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteClass(id), 'Xóa lớp thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
