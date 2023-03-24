export interface TICLogEntry {
    direction: 'out' | 'in';
    value: number;
}

export function tokenizeLogs(contents: Uint8Array) {
    let is_output = false;
    let comma_count = 0;
    let read_since_comma = 0;
    let current_chunk = '';
    let current_command = 0;
    const commands: TICLogEntry[] = [];

    for (const char of contents) {
        // if the character is a comma, increment the comma count
        if (comma_count == 4 && read_since_comma == 0) {
            read_since_comma++;
            continue; // skip this character
        }
        if (comma_count == 4 && read_since_comma == 1) {
            // we're at the end of one log
            comma_count = 0;
            read_since_comma = 0;
            current_chunk = '';
            commands.push({
                direction: is_output ? 'out' : 'in',
                value: current_command
            });
            continue;
        }
        
        current_chunk += String.fromCharCode(char);
        if (char == ','.charCodeAt(0)) {
            comma_count++;
            read_since_comma = 0;
            current_chunk = '';
            continue;
        }
        if (comma_count == 2 && read_since_comma == 0) {
            // this is the command type
            is_output = current_chunk == 'O';
        }
        if (comma_count == 3 && read_since_comma == 3) {
            current_command = Number(current_chunk);
        }
        read_since_comma++;
    }

    return commands;
}

export type TICEvent = {
    type: 'unknown',
    value: number;
} | {
    type: 'uart';
    direction: 'out' | 'in';
    value: string;
} | {
    type: 'power',
    value: boolean;
} | {
    type: 'button',
    which: 'left' | 'right' | 'middle',
    value: boolean;
} | {
    type: 'adc'
} | {
    type: 'pwm'
} | {
    type: 'regulator-adc'
}

export function parseLogs(commands: TICLogEntry[]) {
    let last_token: TICLogEntry = { direction: 'out', value: 0 };
    let sb_tx = '';
    const events: TICEvent[] = [];
    let tranmission_state: 'idle' | 'data' | 'length' = 'idle';
    let tranmission_remaining = 0;
    let tic_tx = '';

    for (const entry of commands) {
        // SB -> TIC UART
        if (entry.direction == 'in') {
            // we're still getting a UART message from SB
            sb_tx += String.fromCharCode(entry.value);
        }
        if (entry.direction == 'out' && last_token.direction == 'in') {
            // we're done with the UART message from SB
            events.push({
                type: 'uart',
                direction: 'in',
                value: sb_tx
            });
            sb_tx = '';
        }
        last_token = entry;

        // TIC -> SB UART
        if (entry.direction == 'out' && tranmission_state == 'length') {
            tranmission_remaining = entry.value;
            tranmission_state = 'data';
            continue;
        }
        if (entry.direction == 'out' && tranmission_state == 'data') {
            tic_tx += String.fromCharCode(entry.value);
            tranmission_remaining--;
            if (tranmission_remaining == 0) {
                events.push({
                    type: 'uart',
                    direction: 'out',
                    value: tic_tx
                });
                tic_tx = '';
                tranmission_state = 'idle';
            }
            continue;
        }

        // TIC -> SB Commands
        if (entry.direction == 'out') {
            switch (entry.value) {
                case 0x01:
                    events.push({
                        type: 'power',
                        value: true
                    })
                    break;

                case 0x02:
                    events.push({
                        type: 'power',
                        value: false
                    })
                    break;
                
                case 0x07:
                    events.push({
                        type: 'button',
                        which: 'middle',
                        value: true
                    });
                    break;

                case 0x08:
                    events.push({
                        type: 'button',
                        which: 'middle',
                        value: false
                    });
                    break;

                case 0x05:
                    events.push({
                        type: 'button',
                        which: 'left',
                        value: true
                    });
                    break;

                case 0x06:
                    events.push({
                        type: 'button',
                        which: 'left',
                        value: false
                    });
                    break;

                case 0x09:
                    events.push({
                        type: 'button',
                        which: 'right',
                        value: true
                    });
                    break;

                case 0x0A:
                    events.push({
                        type: 'button',
                        which: 'right',
                        value: false
                    });
                    break;

                case 0x18:
                    events.push({
                        type: 'regulator-adc'
                    });
                    break;

                case 0x28:
                    events.push({
                        type: 'adc'
                    });
                    break;

                case 0x2B: 
                    events.push({
                        type: 'pwm'
                    });
                    break;

                case 0x2C:
                    tranmission_state = 'length';
                    break;
                
                default:
                    events.push({
                        type: 'unknown',
                        value: entry.value
                    });
                    break;
            }
        }
    }

    return events;
}