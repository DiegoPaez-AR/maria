#!/bin/bash
nginx -T 2>/dev/null | grep -nE "configuration file|server_name" | head -20
