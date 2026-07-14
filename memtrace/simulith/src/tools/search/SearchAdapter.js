export class SearchAdapter {
  async search(query) {
    throw new Error('SearchAdapter must implement search(query)');
  }
}
