import {localPool,SyntheticProvider,workOne} from './service.mjs';
const pool=localPool(process.env.TEST_WORKER_DATABASE_URL),providerPool=localPool(process.env.TEST_PROVIDER_DATABASE_URL);
try{await workOne(pool,new SyntheticProvider(providerPool),{tenant:'alpha',crashAfterProvider:true});}finally{await pool.end();await providerPool.end();}
