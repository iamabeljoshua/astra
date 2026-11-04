FROM python:3.14-slim@sha256:930e1abba7c4e8f96ed93e8012c35d174d7732752731bbd5e8e757d7ec6f3966
COPY requirements.lock /requirements.lock
RUN pip install --no-cache-dir --no-deps --only-binary=:all: --require-hashes -r /requirements.lock
COPY fonts /worker/fonts
COPY worker /worker
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin scene
WORKDIR /tmp
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/worker
ENTRYPOINT ["python", "/worker/run_job.py"]
