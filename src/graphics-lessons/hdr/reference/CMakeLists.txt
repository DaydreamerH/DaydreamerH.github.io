add_executable(31_HDR main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(31_HDR glfw opengl32)
endif()

foreach(FILE_NAME lighting.vs lighting.fs hdr.vs hdr.fs)
    add_custom_command(TARGET 31_HDR POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:31_HDR>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 31_HDR POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_SOURCE_DIR}/images/wood.png"
    "$<TARGET_FILE_DIR:31_HDR>/wood.png"
)
