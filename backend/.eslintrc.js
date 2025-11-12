module.exports = {
    extends: [
        '@jitsi/eslint-config'
    ],
    rules: {
        '@typescript-eslint/member-ordering': [
            'error',
            {
                default: [
                    'signature',
                    'private-static-field',
                    'protected-static-field',
                    'public-static-field',
                    'private-instance-field',
                    'protected-instance-field',
                    'public-instance-field',
                    'constructor',
                    'private-instance-method',
                    'protected-instance-method',
                    'public-instance-method'
                ]
            }
        ],
        '@typescript-eslint/only-throw-error': 'off',
        'no-useless-escape': 'warn'
    }
};
