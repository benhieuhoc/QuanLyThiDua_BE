import { sendSuccess, handleError } from "../utils/http";
import { fetchAllGrade } from "../service/gradeService";

// Khối là dữ liệu cố định (khởi tạo trong migration), chỉ cho đọc
export const getGrades = async (req: any, res: any) => {
    try {
        return sendSuccess(res, await fetchAllGrade());
    } catch (err) {
        return handleError(res, err);
    }
}
