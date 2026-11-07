import { sendSuccess, sendError, handleError, parseId, parseDate } from "../utils/http";
import { GENDERS, StudentInput, fetchAllStudent, checkStudentExist, createStudent, updateStudent, deleteStudent } from "../service/studentService";
import { fetchAssignedClassIds } from "../service/accountService";

// student.code là varchar(20) (chữ/số), name là varchar(50); gender, birthdate không bắt buộc (gửi null để xóa)
const validateStudentInput = (body: any, required: boolean, prefix = '') => {
    const errors: any[] = [];
    const data: Partial<StudentInput> = {};

    if (body?.code !== undefined || required) {
        const code = typeof body?.code === 'string' || typeof body?.code === 'number' ? String(body.code).trim() : '';
        if (!/^[0-9A-Za-z]{1,20}$/.test(code)) errors.push({ field: `${prefix}code`, message: 'Mã học sinh bắt buộc, chữ/số, tối đa 20 ký tự' });
        data.code = code;
    }

    if (body?.name !== undefined || required) {
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 50) errors.push({ field: `${prefix}name`, message: 'Tên bắt buộc, tối đa 50 ký tự' });
        data.name = name;
    }
    if (body?.gender !== undefined) {
        if (body.gender !== null && !GENDERS.includes(body.gender)) {
            errors.push({ field: `${prefix}gender`, message: `gender là null hoặc một trong: ${GENDERS.join(', ')}` });
        }
        data.gender = body.gender;
    } else if (required) {
        data.gender = null;
    }
    if (body?.birthdate !== undefined) {
        const birthdate = body.birthdate === null ? null : parseDate(body.birthdate);
        if (body.birthdate !== null && !birthdate) errors.push({ field: `${prefix}birthdate`, message: 'birthdate là null hoặc ngày YYYY-MM-DD' });
        data.birthdate = birthdate;
    } else if (required) {
        data.birthdate = null;
    }
    return { data, errors };
}

// Query: ?classid=&branchid=&gradeid= (không bắt buộc)
export const getStudents = async (req: any, res: any) => {
    try {
        const filter: { classid?: number, branchid?: number, gradeid?: number, classIds?: number[] } = {};
        for (const key of ['classid', 'branchid', 'gradeid'] as const) {
            if (req.query[key] !== undefined) {
                const value = parseId(req.query[key]);
                if (!value) return sendError(res, 400, `${key} không hợp lệ`);
                filter[key] = value;
            }
        }
        // Cờ đỏ chỉ xem học sinh của lớp được phân công
        if (req.user.kind === 'codo') {
            filter.classIds = await fetchAssignedClassIds(req.user.id);
            if (filter.classid && !filter.classIds.includes(filter.classid)) {
                return sendError(res, 403, 'Không có quyền xem học sinh lớp này');
            }
        }
        return sendSuccess(res, await fetchAllStudent(filter));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getStudent = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const student = await checkStudentExist(id);
        if (!student) return sendError(res, 404, 'Không tìm thấy học sinh');
        if (req.user.kind === 'codo' && !(await fetchAssignedClassIds(req.user.id)).includes(student.classid)) {
            return sendError(res, 403, 'Không có quyền xem học sinh lớp này');
        }
        return sendSuccess(res, student);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { classid, students: [{ name, gender?, birthdate? }] } — thêm hàng loạt học sinh vào 1 lớp
export const postStudents = async (req: any, res: any) => {
    try {
        const classid = parseId(req.body?.classid);
        const rawStudents = req.body?.students;
        const errors: any[] = [];
        if (!classid) errors.push({ field: 'classid', message: 'classid không hợp lệ' });

        const students: StudentInput[] = [];
        if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
            errors.push({ field: 'students', message: 'students phải là mảng không rỗng' });
        } else {
            rawStudents.forEach((raw: any, i: number) => {
                const { data, errors: itemErrors } = validateStudentInput(raw, true, `students[${i}].`);
                errors.push(...itemErrors);
                students.push(data as StudentInput);
            });
            const codes = students.map((s) => s.code);
            if (new Set(codes).size !== codes.length) errors.push({ field: 'students', message: 'Mã học sinh bị trùng' });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        return sendSuccess(res, await createStudent(classid!, students), 'Thêm học sinh thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { name?, gender?, birthdate?, classid? } — đổi classid là chuyển lớp
export const putStudent = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');

        const { data, errors } = validateStudentInput(req.body, false);
        let classid: number | undefined;
        if (req.body?.classid !== undefined) {
            classid = parseId(req.body.classid) ?? undefined;
            if (!classid) errors.push({ field: 'classid', message: 'classid không hợp lệ' });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        return sendSuccess(res, await updateStudent(id, { ...data, classid }), 'Cập nhật học sinh thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeStudent = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteStudent(id), 'Xóa học sinh thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
