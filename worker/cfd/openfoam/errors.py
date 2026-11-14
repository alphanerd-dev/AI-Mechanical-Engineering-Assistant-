"""Typed worker errors shared by the CFD runtime modules."""

class WorkerError(Exception):
    pass


class WorkerTimeout(WorkerError):
    pass
