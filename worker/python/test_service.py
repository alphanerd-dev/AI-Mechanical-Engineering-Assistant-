import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from service import WorkerHandler, JOBS, LOCK

class WorkerServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["WORKER_API_TOKEN"] = "test-worker-token"
        import service
        service.API_TOKEN = "test-worker-token"
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), WorkerHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def call(self, method, path, payload=None, token="test-worker-token"):
        data=json.dumps(payload).encode() if payload is not None else None
        request=Request(self.base+path,data=data,method=method,headers={"content-type":"application/json","authorization":f"Bearer {token}"})
        try:
            with urlopen(request,timeout=2) as response:
                return response.status,json.loads(response.read())
        except HTTPError as exc:
            return exc.code,json.loads(exc.read())

    def test_rejects_missing_token(self):
        status,_=self.call("GET","/v1/jobs/missing",token="wrong")
        self.assertEqual(status,401)

    def test_rejects_unknown_capability(self):
        status,body=self.call("POST","/v1/jobs",{"id":"test-unknown-capability","capability":"ARBITRARY","inputs":{}})
        self.assertEqual(status,400)
        self.assertFalse(body["accepted"])

    def test_job_id_replay_is_idempotent_and_conflict_is_rejected(self):
        job_id="test-idempotency-contract"
        payload={"id":job_id,"capability":"UNITS.CONVERT","inputs":{"value":1,"fromUnit":"m","toUnit":"mm"}}
        status,body=self.call("POST","/v1/jobs",payload)
        self.assertEqual(status,202)
        self.assertTrue(body["accepted"])
        status,body=self.call("POST","/v1/jobs",payload)
        self.assertEqual(status,202)
        self.assertTrue(body["accepted"])
        status,body=self.call("POST","/v1/jobs",{**payload,"inputs":{"value":2,"fromUnit":"m","toUnit":"mm"}})
        self.assertEqual(status,409)
        self.assertFalse(body["accepted"])

    def test_delete_marks_queued_job_cancelled(self):
        job_id="test-cancel-queued"
        with LOCK:
            JOBS[job_id]={"jobId":job_id,"status":"QUEUED","requestHash":"unused","cancelRequested":False}
        status,body=self.call("DELETE",f"/v1/jobs/{job_id}")
        self.assertEqual(status,200)
        self.assertEqual(body["status"],"CANCELLED")
        self.assertTrue(body["cancelRequested"])

if __name__=="__main__":
    unittest.main()
