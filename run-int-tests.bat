@echo off
cd /d C:\SocialOps\apps\api
node --experimental-vm-modules C:\SocialOps\node_modules\jest\bin\jest.js --config C:\SocialOps\apps\api\jest.config.integration.cjs --testPathPatterns="content-operations-v2" --no-coverage 2>&1