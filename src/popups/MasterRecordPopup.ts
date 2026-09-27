import { Container, Sprite } from 'pixi.js';

import { getProfile, updateProfile } from '../app/storage';
import { tex } from '../app/textures';
import type { MasterRecord } from '../net/account';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { BasePopup } from './BasePopup';

const RESULT = { win: '胜', loss: '负', draw: '平' } as const;

/**
 * The master (神龙棋仙) as a virtual player: its record against players and
 * the games it played for people (托管), plus the privacy switch for whether
 * the player's own name may appear in that record.
 */
export class MasterRecordPopup extends BasePopup {
  private privacy: Button;

  constructor(record: MasterRecord | undefined) {
    super('神龙棋仙 · 虚拟棋手', 560, 620);
    const r = record ?? { wins: 0, losses: 0, draws: 0, challenges: 0, delegated: 0, recent: [] };
    const avatar = new Sprite(tex('avatar-master'));
    avatar.anchor.set(0.5);
    avatar.width = avatar.height = 84;
    avatar.position.set(-190, -170);
    const total = label(`${r.wins} 胜 ${r.losses} 负${r.draws ? ` ${r.draws} 平` : ''}`, 'heading', { fontSize: 30, fill: 0xffd84a });
    total.anchor.set(0, 0.5);
    total.position.set(-130, -188);
    const split = label(`被挑战 ${r.challenges} 局 · 替人托管 ${r.delegated} 局`, 'body', { fontSize: 17, fill: 0xd9ccff });
    split.anchor.set(0, 0.5);
    split.position.set(-130, -152);
    this.body.addChild(avatar, total, split);

    const list = new Container();
    list.position.set(-230, -110);
    if (!r.recent.length) {
      const empty = label('还没有人挑战神龙，也没有人托管给它', 'small', { fontSize: 15, fill: 0xc9bde8 });
      empty.anchor.set(0, 0);
      list.addChild(empty);
    }
    r.recent.forEach((game, index) => {
      const who = game.name ?? '匿名棋手';
      const text = game.kind === 'delegate' ? `替 ${who} 托管 · ${RESULT[game.result]}` : `${who} 挑战 · 神龙${RESULT[game.result]}`;
      const line = label(text, 'small', { fontSize: 15, fill: game.result === 'win' ? 0xffe98a : 0xd9ccff });
      line.anchor.set(0, 0);
      line.y = index * 27;
      list.addChild(line);
    });
    this.body.addChild(list);

    this.privacy = new Button({ text: this.privacyText(), skin: 'white', width: 420, height: 60, fontSize: 18, onPress: () => this.togglePrivacy() });
    this.privacy.y = 200;
    const note = label('关闭时显示为「匿名棋手」；托管标记对对手总是可见，托管局的积分归神龙', 'small', { fontSize: 13, fill: 0xc9bde8, wordWrap: true, wordWrapWidth: 440, align: 'center' });
    note.y = 250;
    this.body.addChild(this.privacy, note);
  }

  private privacyText() {
    return getProfile().showInMasterRecord ? '神龙战绩里显示我的名字：开' : '神龙战绩里显示我的名字：关';
  }

  private togglePrivacy() {
    updateProfile({ showInMasterRecord: !getProfile().showInMasterRecord });
    this.privacy.setText(this.privacyText());
  }
}
