import { detectFinishTriggers, generateProcessList } from '../matcher';

describe('matcher', () => {
  describe('detectFinishTriggers', () => {
    it('should return empty array for empty inputs', () => {
      expect(detectFinishTriggers('')).toEqual([]);
      expect(detectFinishTriggers(null as any)).toEqual([]);
    });

    it('should detect cross_cloth trigger correctly', () => {
      expect(detectFinishTriggers('ビニルクロス')).toContain('cross_cloth');
      expect(detectFinishTriggers('壁面クロス貼り')).toContain('cross_cloth');
      expect(detectFinishTriggers('布クロス')).toContain('cross_cloth');
    });

    it('should detect wood_flooring trigger correctly', () => {
      expect(detectFinishTriggers('複合フローリング')).toContain('wood_flooring');
      expect(detectFinishTriggers('木床')).toContain('wood_flooring');
    });

    it('should detect painting_ep_sop trigger correctly', () => {
      expect(detectFinishTriggers('EP塗装')).toContain('painting_ep_sop');
      expect(detectFinishTriggers('アクリルつや有りSOP')).toContain('painting_ep_sop');
    });

    it('should handle case insensitivity', () => {
      expect(detectFinishTriggers('ep塗装')).toContain('painting_ep_sop');
      expect(detectFinishTriggers('sop')).toContain('painting_ep_sop');
    });
  });

  describe('generateProcessList', () => {
    it('should generate expanded process steps with correct properties', () => {
      const mockRooms = [
        {
          roomName: 'テスト室',
          floor: '複合フローリング',
          baseboard: '木製巾木',
          wall: 'ビニルクロス',
          ceiling: 'EP塗装',
          remarks: '特記事項なし'
        }
      ];

      const processes = generateProcessList(mockRooms);
      
      expect(processes.length).toBeGreaterThan(0);

      // Verify cross cloth steps exist
      const crossSteps = processes.filter(p => p.finishTriggerId === 'cross_cloth');
      expect(crossSteps.length).toBeGreaterThan(0);
      expect(crossSteps[0].roomName).toBe('テスト室');
      expect(crossSteps[0].location).toBe('壁');
      expect(crossSteps[0].finishDisplayName).toBe('ビニルクロス貼り');
      expect(crossSteps[0]).toHaveProperty('confidence');
      expect(crossSteps[0]).toHaveProperty('process_name');
      expect(crossSteps[0]).toHaveProperty('required_by_default');

      // Verify flooring steps exist
      const flooringSteps = processes.filter(p => p.finishTriggerId === 'wood_flooring');
      expect(flooringSteps.length).toBeGreaterThan(0);
      expect(flooringSteps[0].location).toBe('床');

      // Verify painting steps exist
      const paintingSteps = processes.filter(p => p.finishTriggerId === 'painting_ep_sop');
      expect(paintingSteps.length).toBeGreaterThan(0);
      expect(paintingSteps[0].location).toBe('天井');
    });

    it('should return empty list when no matches are found', () => {
      const mockRooms = [
        {
          roomName: '空室',
          floor: 'コンクリート打放し',
          baseboard: '',
          wall: '',
          ceiling: '',
          remarks: ''
        }
      ];

      const processes = generateProcessList(mockRooms);
      expect(processes.length).toBe(0);
    });
  });
});
