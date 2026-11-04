FROM python:3.14-slim
COPY requirements.lock /requirements.lock
RUN pip install --no-cache-dir -r /requirements.lock
COPY fonts /worker/fonts
COPY worker /worker
RUN useradd -m render
USER render
WORKDIR /tmp
ENV PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python", "/worker/run_job.py"]
