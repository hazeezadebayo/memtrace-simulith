export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool || !tool.name) {
      throw new Error('Tool must have a name');
    }
    this.tools.set(tool.name, tool);
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  getSchemas() {
    return Array.from(this.tools.values()).map(t => t.getSchema());
  }

  getManifest() {
    const entries = Array.from(this.tools.values()).map(t => t.getManifestEntry());
    return entries.join('\n\n');
  }

  hasTools() {
    return this.tools.size > 0;
  }

  async callTool(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: "${name}". Available: ${Array.from(this.tools.keys()).join(', ')}`);
    }
    return await tool.execute(args);
  }
}
