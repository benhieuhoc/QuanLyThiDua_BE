import branchRouter from './branchRouter';
import gradeRouter from './gradeRouter';
import teacherRouter from './teacherRouter';
import classRouter from './classRouter';
import studentRouter from './studentRouter';
import schoolYearRouter from './schoolYearRouter';
import weekRouter from './weekRouter';
import pointRouter from './pointRouter';
import scoreRouter from './scoreRouter';
import authRouter from './authRouter';
import accountRouter from './accountRouter';

const express = require('express');
const router = express.Router();

router.get('/', (req: any, res: any) => {
  res.send('Hello World!');
});

router.use('/branches', branchRouter);
router.use('/grades', gradeRouter);
router.use('/teachers', teacherRouter);
router.use('/classes', classRouter);
router.use('/students', studentRouter);
router.use('/school-years', schoolYearRouter);
router.use('/weeks', weekRouter);
router.use('/points', pointRouter);
router.use('/scores', scoreRouter);
router.use('/auth', authRouter);
router.use('/accounts', accountRouter);

export default router;
