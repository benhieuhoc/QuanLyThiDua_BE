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
import publicRouter from './publicRouter';
import ruleRouter from './ruleRouter';
import parentRouter from './parentRouter';

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
router.use('/rules', ruleRouter);
router.use('/scores', scoreRouter);
router.use('/auth', authRouter);
router.use('/accounts', accountRouter);
router.use('/parents', parentRouter);
router.use('/public', publicRouter);

export default router;
