
// Get a password from the console, printing stars while the user types
var promptPassword = function(callback) {
    var stdin = process.openStdin();
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    var password = '';
    process.stdout.write('Password: ');
    process.stdin.on('data', function (ch) {
        var ch = ch + "";

        switch (ch) {
            case "\n": case "\r": case "\u0004":
                // They've finished typing their password
                process.stdin.setRawMode(false);
                stdin.pause();
                callback(password);
                break;

            case "\u0003":
                // Ctrl C
                console.log('Cancelled');
                process.stdin.setRawMode(false);
                stdin.pause();
                callback(undefined);
                break;

            default:
                // More passsword characters
                process.stdout.write('*');
                password += ch;
                break;
        }
    });
}

exports.promptPassword = promptPassword
