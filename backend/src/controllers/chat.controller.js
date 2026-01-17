import { AIAnalyzerService } from '../services/aiAnalyzer.js';

const aiAnalyzer = new AIAnalyzerService();

export const ChatController = {
  /**
   * Chat with logs for a specific run
   */
  async chat(req, res) {
    try {
      const { runId, message, history } = req.body;

      if (!runId || !message) {
        return res.status(400).json({ error: 'runId and message are required' });
      }

      console.log(`💬 Chat request for run ${runId}: "${message}"`);
      
      const response = await aiAnalyzer.chat(parseInt(runId), message, history || []);
      
      return res.json(response);
    } catch (error) {
      console.error('Chat controller error:', error);
      return res.status(500).json({ error: 'Failed to process chat message' });
    }
  }
};
