export class Tool {
  name = '';
  description = '';
  parameters = { type: 'object', properties: {}, required: [] };

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }

  getManifestEntry() {
    return `- ${this.name}: ${this.description}\n  Parameters: ${JSON.stringify(this.parameters)}`;
  }

  async execute(args) {
    throw new Error(`Tool "${this.name}" must implement execute(args)`);
  }
}
