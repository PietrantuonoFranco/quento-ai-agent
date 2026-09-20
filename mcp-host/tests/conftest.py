import os

# config.py instancia Settings al importarse: las variables tienen que existir antes
# (y las del entorno pisan a las de mcp-host/.env, así los tests no dependen de él).
os.environ["MCP_SERVER_URL"] = "http://mcp.test"
os.environ["MCP_API_KEY"] = "test-key"
os.environ["GEMINI_API_KEY"] = "gemini-test-key"
