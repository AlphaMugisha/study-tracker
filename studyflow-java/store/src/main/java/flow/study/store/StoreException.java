package flow.study.store;

/** Anything the local database refused to do. */
public class StoreException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public StoreException(String message) {
        super(message);
    }

    public StoreException(String message, Throwable cause) {
        super(message, cause);
    }
}
