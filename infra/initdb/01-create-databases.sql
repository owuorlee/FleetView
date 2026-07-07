-- Runs once on first postgres container start.
-- traccar: owned by Traccar (schema managed by Traccar itself)
-- app:     owned by the NestJS business backend (schema managed by Prisma)
CREATE USER traccar WITH PASSWORD 'devpassword';
CREATE DATABASE traccar OWNER traccar;
CREATE USER app WITH PASSWORD 'devpassword';
CREATE DATABASE app OWNER app;
