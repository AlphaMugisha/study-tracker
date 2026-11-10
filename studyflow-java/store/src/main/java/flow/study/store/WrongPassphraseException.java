package flow.study.store;

/**
 * Said separately from StoreException so the unlock screen can tell her to try
 * again rather than showing her a database error about a corrupt file, which
 * is what a wrong AES key actually looks like from underneath.
 */
public class WrongPassphraseException extends StoreException {
    private static final long serialVersionUID = 1L;

    public WrongPassphraseException() {
        super("That passphrase does not open this copy.");
    }
}
