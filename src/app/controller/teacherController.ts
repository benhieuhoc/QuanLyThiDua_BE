import { sendSuccess, sendError, handleError, parseId } from "../utils/http";
import { fetchAllTeacher, checkTeacherExist, createTeacher, updateTeacher, deleteTeacher } from "../service/teacherService";

// teacher.name là varchar(25)
const isValidName = (name: any) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 25;

export const getTeachers = async (req: any, res: any) => {
    try {
        let branchid: number | undefined;
        if (req.query.branchid !== undefined) {
            branchid = parseId(req.query.branchid) ?? undefined;
            if (!branchid) return sendError(res, 400, 'branchid không hợp lệ');
        }
        return sendSuccess(res, await fetchAllTeacher(branchid));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getTeacher = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const teacher = await checkTeacherExist(id);
        if (!teacher) return sendError(res, 404, 'Không tìm thấy giáo viên');
        return sendSuccess(res, teacher);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { branchid, names: string[] } — tạo hàng loạt giáo viên cho 1 phân hiệu
export const postTeachers = async (req: any, res: any) => {
    try {
        const branchid = parseId(req.body?.branchid);
        const names = req.body?.names;
        const errors: any[] = [];
        if (!branchid) errors.push({ field: 'branchid', message: 'branchid không hợp lệ' });
        if (!Array.isArray(names) || names.length === 0) {
            errors.push({ field: 'names', message: 'names phải là mảng không rỗng' });
        } else {
            names.forEach((name: any, i: number) => {
                if (!isValidName(name)) errors.push({ field: `names[${i}]`, message: 'Tên bắt buộc, tối đa 25 ký tự' });
            });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const teachers = await createTeacher(branchid!, names.map((name: string) => name.trim()));
        return sendSuccess(res, teachers, 'Tạo giáo viên thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

export const putTeacher = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');

        const errors: any[] = [];
        if (req.body?.name !== undefined && !isValidName(req.body.name)) {
            errors.push({ field: 'name', message: 'Tên bắt buộc, tối đa 25 ký tự' });
        }
        let branchid: number | undefined;
        if (req.body?.branchid !== undefined) {
            branchid = parseId(req.body.branchid) ?? undefined;
            if (!branchid) errors.push({ field: 'branchid', message: 'branchid không hợp lệ' });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const teacher = await updateTeacher(id, req.body?.name?.trim(), branchid);
        return sendSuccess(res, teacher, 'Cập nhật giáo viên thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeTeacher = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteTeacher(id), 'Xóa giáo viên thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
